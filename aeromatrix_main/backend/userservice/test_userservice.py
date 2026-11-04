"""Tests for the user service. Run from this folder:  python -m unittest test_userservice -v"""

import os
import tempfile
import unittest

_tmp = tempfile.mkdtemp(prefix="amx-userservice-")
os.environ["AEROMATRIX_USERSERVICE_DATA"] = _tmp
os.environ.pop("AEROMATRIX_AUTHORITY_KEY", None)

from fastapi.testclient import TestClient  # noqa: E402

import app as svc  # noqa: E402

client = TestClient(svc.app)
AUTH = {"X-Authority-Key": "dev-authority-key"}
TEXT = "The station display has been blank for a week."


def post_complaint(text=TEXT, files=None, station_id="s1", name="Alandi"):
    return client.post("/complaints", data={"station_id": station_id, "station_name": name, "text": text}, files=files or [])


class Complaints(unittest.TestCase):
    def test_file_a_complaint_and_read_its_status(self):
        r = post_complaint(files=[("files", ("photo.jpg", b"\xff\xd8\xff", "image/jpeg")), ("files", ("note.pdf", b"%PDF-1.4", "application/pdf"))])
        self.assertEqual(r.status_code, 201, r.text)
        ref = r.json()["reference"]
        self.assertTrue(ref.startswith("AMX-C-"))
        self.assertEqual(r.json()["files"], 2)
        s = client.get(f"/complaints/{ref}")
        self.assertEqual(s.json()["status"], "new")
        self.assertNotIn("text", s.json())  # the person who filed it sees the status, not the whole record

    def test_text_is_checked(self):
        self.assertEqual(post_complaint(text="short").status_code, 422)
        self.assertEqual(post_complaint(text="x" * 2001).status_code, 422)

    def test_files_are_checked(self):
        bad = post_complaint(files=[("files", ("run.exe", b"MZ", "application/octet-stream"))])
        self.assertEqual(bad.status_code, 422)
        many = post_complaint(files=[("files", (f"{i}.txt", b"x", "text/plain")) for i in range(6)])
        self.assertEqual(many.status_code, 422)

    def test_authorities_need_the_key(self):
        post_complaint()
        self.assertEqual(client.get("/complaints").status_code, 401)
        self.assertEqual(client.get("/complaints", headers={"X-Authority-Key": "wrong"}).status_code, 401)
        ok = client.get("/complaints", headers=AUTH)
        self.assertEqual(ok.status_code, 200)
        self.assertGreaterEqual(len(ok.json()["complaints"]), 1)

    def test_authorities_change_the_status_and_files_can_be_opened(self):
        ref = post_complaint(files=[("files", ("a.txt", b"hello", "text/plain"))]).json()["reference"]
        listed = client.get("/complaints", headers=AUTH).json()["complaints"]
        mine = next(c for c in listed if c["reference"] == ref)
        self.assertEqual(mine["files"][0]["name"], "a.txt")
        up = client.patch(f"/complaints/{ref}", headers=AUTH, json={"status": "action_taken", "note": "Technician sent."})
        self.assertEqual(up.status_code, 200)
        self.assertEqual(client.get(f"/complaints/{ref}").json()["status"], "action_taken")
        self.assertEqual(client.patch(f"/complaints/{ref}", headers=AUTH, json={"status": "nonsense"}).status_code, 422)
        f = client.get(f"/complaints/{ref}/files/{mine['files'][0]['id']}", params={"key": "dev-authority-key"})
        self.assertEqual(f.content, b"hello")
        self.assertEqual(client.get(f"/complaints/{ref}/files/{mine['files'][0]['id']}").status_code, 401)

    def test_unknown_reference(self):
        self.assertEqual(client.get("/complaints/AMX-C-NOPE").status_code, 404)


class Devices(unittest.TestCase):
    def test_register_push_and_sync(self):
        self.assertEqual(client.post("/devices", json={"device_id": "bad id!"}).status_code, 422)
        self.assertEqual(client.post("/devices", json={"device_id": "amx-7k2p-91qd", "label": "Balcony"}).status_code, 201)
        first = client.get("/devices/AMX-7K2P-91QD/latest").json()
        self.assertIsNone(first["reading"])  # known, has not reported yet
        self.assertEqual(client.post("/devices/AMX-7K2P-91QD/readings", json={"pm25": 41.5, "pm10": 70, "temperature": 29.1, "humidity": 55}).status_code, 201)
        latest = client.get("/devices/amx-7k2p-91qd/latest").json()
        self.assertEqual(latest["reading"]["pm25"], 41.5)
        self.assertEqual(latest["label"], "Balcony")

    def test_unregistered_devices_are_refused(self):
        self.assertEqual(client.get("/devices/AMX-NOPE-0000/latest").status_code, 404)
        self.assertEqual(client.post("/devices/AMX-NOPE-0000/readings", json={"pm25": 10}).status_code, 404)

    def test_impossible_readings_are_refused(self):
        client.post("/devices", json={"device_id": "AMX-TEST-0001"})
        self.assertEqual(client.post("/devices/AMX-TEST-0001/readings", json={"humidity": 400}).status_code, 422)


if __name__ == "__main__":
    unittest.main()

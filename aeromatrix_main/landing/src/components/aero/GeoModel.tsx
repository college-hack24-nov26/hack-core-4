// @ts-nocheck
// Original AeroMatrix voxel pollution model, extracted from GeospatialSection.jsx.
// Geometry, materials and layer filtering are unchanged; added: camera focus easing + voxel click inspect.
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function GeoModel({ activeLayer = 'all', focused = false, onSelect }) {
  const mountRef = useRef(null);
  const activeLayerRef = useRef(activeLayer);
  const focusedRef = useRef(focused);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { activeLayerRef.current = activeLayer; }, [activeLayer]);
  useEffect(() => { focusedRef.current = focused; }, [focused]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let animId;
    let isVisible = true;

    // Three.js Spatial Hexagonal / Voxel Grid
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030712, 0.04);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 11, 13);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Grid Matrix Group
    const gridMaster = new THREE.Group();
    scene.add(gridMaster);

    // Create 12x12 3D Spatial Voxel Columns
    const ROWS = 10;
    const COLS = 10;
    const SPACING = 1.05;
    const cells = [];

    const boxGeo = new THREE.BoxGeometry(0.85, 1, 0.85);

    for (let r = -ROWS / 2; r < ROWS / 2; r++) {
      for (let c = -COLS / 2; c < COLS / 2; c++) {
        const distFromCenter = Math.sqrt(r * r + c * c);

        // Assign zones
        let zoneType = 'normal';
        let baseHeight = 0.4 + Math.sin(r * 0.5) * Math.cos(c * 0.5) * 0.3;
        let hexColor = 0x0f244a;

        if (distFromCenter < 2.0) {
          zoneType = 'hotspots';
          baseHeight = 1.8 + Math.random() * 0.8;
          hexColor = 0xf59e0b; // Hotspot amber
        } else if (Math.abs(r) === 1 || Math.abs(c) === 1) {
          zoneType = 'traffic';
          baseHeight = 0.8 + Math.random() * 0.4;
          hexColor = 0x00f2fe; // Traffic cyan
        } else if (r > 2 && c > 2) {
          zoneType = 'industrial';
          baseHeight = 2.2 + Math.random() * 0.6;
          hexColor = 0xf43f5e; // Industrial rose
        } else if (r < -2 && c < -2) {
          zoneType = 'buffers';
          baseHeight = 0.5;
          hexColor = 0x10b981; // Green buffer
        }

        const mat = new THREE.MeshStandardMaterial({
          color: hexColor,
          roughness: 0.4,
          metalness: 0.6,
          transparent: true,
          opacity: 0.85
        });

        const mesh = new THREE.Mesh(boxGeo, mat);
        mesh.position.set(c * SPACING, baseHeight / 2, r * SPACING);
        mesh.scale.set(1, baseHeight, 1);
        gridMaster.add(mesh);

        // Wireframe border
        const edges = new THREE.EdgesGeometry(boxGeo);
        const edgeLine = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.3 })
        );
        mesh.add(edgeLine);

        cells.push({
          mesh,
          zoneType,
          originalColor: hexColor,
          baseHeight,
          r,
          c
        });
      }
    }

    // Atmospheric Grid Particles
    const pCount = 200;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 12;
      pPos[i * 3 + 1] = 0.5 + Math.random() * 3;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.08,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });
    const pSystem = new THREE.Points(pGeo, pMat);
    gridMaster.add(pSystem);

    // Lights
    const ambLight = new THREE.AmbientLight(0x0c1e3d, 1.8);
    scene.add(ambLight);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 2.0);
    dirLight.position.set(5, 12, 8);
    scene.add(dirLight);

    // Performance Observer
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        isVisible = entry.isIntersecting;
      });
    }, { threshold: 0.1 });
    observer.observe(container);

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    // Animate
    let focusT = 0;
    // Click a voxel to inspect its real zone + grid position
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const handleClick = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(cells.map(c => c.mesh), false);
      if (hits.length) {
        const cell = cells.find(c => c.mesh === hits[0].object);
        if (cell) onSelectRef.current?.({ zoneType: cell.zoneType, r: cell.r, c: cell.c, height: cell.baseHeight });
      }
    };
    renderer.domElement.addEventListener('click', handleClick);
    renderer.domElement.style.cursor = 'pointer';

    const startTime = performance.now();
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isVisible) return;

      const elapsed = (performance.now() - startTime) * 0.001;
      gridMaster.rotation.y = elapsed * 0.05;

      // Focus zoom: ease camera toward the grid when focused mode is on
      const f = focusedRef.current ? 1 : 0;
      focusT += (f - focusT) * 0.05;
      camera.position.set(0, 11 - focusT * 2.4, 13 - focusT * 2.8);
      camera.lookAt(0, focusT * 0.6, 0);

      const current = activeLayerRef.current;

      // Filter layer heights and opacities
      cells.forEach(cell => {
        if (current === 'all' || cell.zoneType === current) {
          cell.mesh.material.opacity = 0.85;
          const pulse = Math.sin(elapsed * 2 + cell.r + cell.c) * 0.15;
          cell.mesh.scale.y = cell.baseHeight + pulse;
          cell.mesh.position.y = (cell.baseHeight + pulse) / 2;
        } else {
          cell.mesh.material.opacity = 0.15;
          cell.mesh.scale.y = 0.2;
          cell.mesh.position.y = 0.1;
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      ro.disconnect();
      renderer.domElement.removeEventListener('click', handleClick);
      cancelAnimationFrame(animId);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full" />;
}

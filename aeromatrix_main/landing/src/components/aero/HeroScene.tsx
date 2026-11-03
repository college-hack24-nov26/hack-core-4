// @ts-nocheck
// Original AeroMatrix India terrain component — integrated with minimal changes (fog tint only).
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Key Indian Cities for Geospatial Sensor Nodes (Coordinates mapped to texture space)
const CITIES = [
  { name: 'DELHI NCR', x: -0.65, y: 1.85, aqi: 184, isHighRisk: true },
  { name: 'MUMBAI', x: -2.35, y: -0.85, aqi: 92, isHighRisk: false },
  { name: 'BENGALURU', x: -1.05, y: -2.75, aqi: 58, isHighRisk: false },
  { name: 'KOLKATA', x: 2.35, y: 0.25, aqi: 142, isHighRisk: false },
  { name: 'HYDERABAD', x: -0.75, y: -1.35, aqi: 84, isHighRisk: false },
  { name: 'CHENNAI', x: -0.25, y: -2.65, aqi: 64, isHighRisk: false },
  { name: 'AHMEDABAD', x: -2.45, y: 0.35, aqi: 128, isHighRisk: false },
  { name: 'LUCKNOW', x: 0.45, y: 1.25, aqi: 165, isHighRisk: true }
];

export default function HeroScene() {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let animId;
    let isVisible = true;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x1a0a0d, 0.024);

    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    // Adjusted camera so India is centered
    camera.position.set(0, -0.6, 17.5);
    camera.lookAt(0, 0.2, 0);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // 2. Scientific & Atmospheric Lighting
    const ambientLight = new THREE.AmbientLight(0x0c2144, 2.0);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xe0f2fe, 2.8);
    sunLight.position.set(6, 12, 14);
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x00f2fe, 2.2);
    rimLight.position.set(-8, -4, -2);
    scene.add(rimLight);

    const bottomGlow = new THREE.PointLight(0x2dd4bf, 1.8, 20);
    bottomGlow.position.set(0, -2, 4);
    scene.add(bottomGlow);

    // Master 3D India Group (responds to cursor)
    const indiaGroup = new THREE.Group();
    indiaGroup.position.set(0, 0.2, 0);
    // Slight natural pitch for 3D elevation view
    indiaGroup.rotation.x = -0.32;
    scene.add(indiaGroup);

    // 3. Load Realistic Geospatial Satellite Imagery & Elevation Relief
    const texLoader = new THREE.TextureLoader();
    
    const satelliteTex = texLoader.load('/textures/india_satellite.png');
    satelliteTex.colorSpace = THREE.SRGBColorSpace;

    const elevationTex = texLoader.load('/textures/india_elevation.png');

    // 3D Terrain Plane with physical elevation displacement
    const terrainGeo = new THREE.PlaneGeometry(13.2, 13.2, 180, 180);
    const terrainMat = new THREE.MeshStandardMaterial({
      map: satelliteTex,
      displacementMap: elevationTex,
      displacementScale: 0.95,
      displacementBias: -0.05,
      transparent: true,
      alphaTest: 0.04,
      roughness: 0.45,
      metalness: 0.25,
      side: THREE.DoubleSide
    });

    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    indiaGroup.add(terrainMesh);

    // 3D Extruded Depth Underlay (Gives the map a physical solid 3D geospatial slab feel)
    const slabGeo = new THREE.PlaneGeometry(13.2, 13.2, 80, 80);
    const slabMat = new THREE.MeshStandardMaterial({
      map: satelliteTex,
      transparent: true,
      alphaTest: 0.05,
      color: 0x051329,
      roughness: 0.8,
      metalness: 0.5
    });

    // Create 3 subtle depth layers behind the terrain for 3D thickness
    for (let d = 1; d <= 3; d++) {
      const slabMesh = new THREE.Mesh(slabGeo, slabMat);
      slabMesh.position.set(0, 0, -d * 0.14);
      slabMesh.scale.set(1 - d * 0.005, 1 - d * 0.005, 1);
      indiaGroup.add(slabMesh);
    }

    // 4. Subtle Geospatial Latitude & Longitude Coordinate Lattice
    const gridGroup = new THREE.Group();
    const gridMat = new THREE.LineBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.2
    });

    for (let y = -5.0; y <= 5.0; y += 1.6) {
      const pts = [new THREE.Vector3(-6.0, y, -0.1), new THREE.Vector3(6.0, y, -0.1)];
      const lineG = new THREE.BufferGeometry().setFromPoints(pts);
      gridGroup.add(new THREE.Line(lineG, gridMat));
    }
    for (let x = -5.0; x <= 5.0; x += 1.6) {
      const pts = [new THREE.Vector3(x, -5.5, -0.1), new THREE.Vector3(x, 5.5, -0.1)];
      const lineG = new THREE.BufferGeometry().setFromPoints(pts);
      gridGroup.add(new THREE.Line(lineG, gridMat));
    }
    indiaGroup.add(gridGroup);

    // 5. Geospatial Sensor Hub Beacons (Real Indian Cities)
    const nodeGroup = new THREE.Group();
    const pulseRings = [];

    const beaconGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const ringGeo = new THREE.RingGeometry(0.12, 0.22, 32);

    CITIES.forEach((city) => {
      const zPos = 0.55;
      const beaconColor = city.isHighRisk ? 0xf59e0b : 0x00f2fe;

      // Center glowing point
      const bMat = new THREE.MeshBasicMaterial({ color: beaconColor });
      const bMesh = new THREE.Mesh(beaconGeo, bMat);
      bMesh.position.set(city.x, city.y, zPos);
      nodeGroup.add(bMesh);

      // Vertical Laser Line
      const laserPts = [
        new THREE.Vector3(city.x, city.y, zPos),
        new THREE.Vector3(city.x, city.y, zPos + 1.2)
      ];
      const laserGeo = new THREE.BufferGeometry().setFromPoints(laserPts);
      const laserMat = new THREE.LineBasicMaterial({
        color: beaconColor,
        transparent: true,
        opacity: 0.65
      });
      nodeGroup.add(new THREE.Line(laserGeo, laserMat));

      // Concentric Pulsing Wave Ring
      const rMat = new THREE.MeshBasicMaterial({
        color: beaconColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
      });
      const rMesh = new THREE.Mesh(ringGeo, rMat);
      rMesh.position.set(city.x, city.y, zPos + 0.05);
      nodeGroup.add(rMesh);

      pulseRings.push({
        mesh: rMesh,
        speed: 0.02 + Math.random() * 0.015,
        phase: Math.random() * Math.PI
      });
    });

    indiaGroup.add(nodeGroup);

    // 6. Subtle Environmental Data Particles (Drifting Data Streams)
    const particleCount = 400;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleSpeeds = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 14;
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 14;
      particlePositions[i * 3 + 2] = 0.4 + Math.random() * 2.8;
      particleSpeeds[i] = 0.004 + Math.random() * 0.006;
    }

    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.06,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(particleGeom, particleMat);
    indiaGroup.add(particles);

    // 7. Interactive Cursor Parallax
    const mouse = { x: 0, y: 0 };
    const targetRotation = { x: -0.32, y: 0 };
    const currentRotation = { x: -0.32, y: 0 };

    const handleMouseMove = (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;

      mouse.x = nx;
      mouse.y = ny;

      // Subtle, premium tilt
      targetRotation.y = nx * 0.28;
      targetRotation.x = -0.32 + ny * 0.18;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // Handle Resize
    const handleResize = () => {
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // Performance Observer
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        isVisible = entry.isIntersecting;
      });
    }, { threshold: 0.05 });
    observer.observe(container);

    // 8. Animation Loop
    const startTime = performance.now();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isVisible) return;

      const elapsed = (performance.now() - startTime) * 0.001;

      // Smooth lerping to cursor
      currentRotation.y += (targetRotation.y - currentRotation.y) * 0.04;
      currentRotation.x += (targetRotation.x - currentRotation.x) * 0.04;

      indiaGroup.rotation.y = currentRotation.y;
      indiaGroup.rotation.x = currentRotation.x;

      // Subtle camera parallax
      camera.position.x = mouse.x * 0.35;
      camera.position.y = -0.6 + (-mouse.y * 0.25);
      camera.lookAt(0, 0.2, 0);

      // Pulse city node rings
      pulseRings.forEach(p => {
        const scaleVal = 1 + Math.sin(elapsed * 3 + p.phase) * 0.45;
        p.mesh.scale.set(scaleVal, scaleVal, 1);
        p.mesh.material.opacity = 0.85 - (scaleVal - 0.55) * 0.55;
      });

      // Drift environmental data particles
      const positions = particleGeom.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] += particleSpeeds[i] * 0.7;
        positions[i * 3 + 1] += particleSpeeds[i] * 1.1;

        if (positions[i * 3 + 1] > 7.0) {
          positions[i * 3 + 1] = -7.0;
          positions[i * 3] = (Math.random() - 0.5) * 14;
        }
      }
      particleGeom.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      cancelAnimationFrame(animId);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      terrainGeo.dispose();
      terrainMat.dispose();
      slabGeo.dispose();
      slabMat.dispose();
    };
  }, []);

  return (
    <div 
      ref={mountRef} 
      className="absolute inset-0 w-full h-full pointer-events-auto"
      style={{ zIndex: 1 }}
      aria-hidden="true"
    />
  );
}

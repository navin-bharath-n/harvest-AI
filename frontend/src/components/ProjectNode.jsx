import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Html } from '@react-three/drei';
import * as THREE from 'three';

export default function ProjectNode({ project, position, isActive, onClick }) {
  const meshRef = useRef();
  const [hovered, setHovered] = useState(false);

  // Animate scale and rotation on hover
  useFrame((state, delta) => {
    const targetScale = isActive ? 1.5 : (hovered ? 1.2 : 1);
    meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
    
    if (isActive) {
      meshRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <boxGeometry args={[1, 1.5, 0.2]} />
        <meshStandardMaterial 
          color={isActive ? "#9b4cf5" : (hovered ? "#ffffff" : "#333333")}
          roughness={0.1}
          metalness={0.8}
          envMapIntensity={isActive ? 2 : 1}
        />
        
        {/* Glow effect for active project */}
        {isActive && (
          <pointLight color="#9b4cf5" intensity={2} distance={3} />
        )}
      </mesh>

      {/* 3D Text Label */}
      <Text
        position={[0, -1, 0]}
        fontSize={0.3}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {project.title}
      </Text>
    </group>
  );
}

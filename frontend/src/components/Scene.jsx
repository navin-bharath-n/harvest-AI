import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, Sparkles } from '@react-three/drei';
import ProjectNode from './ProjectNode';

export default function Scene({ projects, activeProject, setActiveProject }) {
  const groupRef = useRef();

  // Subtle rotation of the entire group over time
  useFrame((state) => {
    if (groupRef.current && !activeProject) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.1) * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      {projects.map((project, index) => {
        // Calculate a circle layout for the projects
        const angle = (index / projects.length) * Math.PI * 2;
        const radius = 4;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        return (
          <Float key={project.id} speed={2} rotationIntensity={0.5} floatIntensity={1}>
            <ProjectNode
              project={project}
              position={[x, 0, z]}
              isActive={activeProject?.id === project.id}
              onClick={() => setActiveProject(project)}
            />
          </Float>
        );
      })}

      {/* Decorative center piece */}
      <Float speed={1} rotationIntensity={2} floatIntensity={2}>
        <mesh position={[0, 0, 0]}>
          <octahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial
            color="#8a2be2"
            emissive="#8a2be2"
            emissiveIntensity={2}
            wireframe
          />
        </mesh>
      </Float>

      {/* Premium ambient particles */}
      <Sparkles count={100} scale={12} size={2} speed={0.4} opacity={0.2} color="#9b4cf5" />
    </group>
  );
}

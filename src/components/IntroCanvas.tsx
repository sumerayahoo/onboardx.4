import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

function HexRings() {
  const hexRef = useRef<THREE.Mesh>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const ring3Ref = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (hexRef.current) {
      hexRef.current.rotation.x += 0.01;
      hexRef.current.rotation.y += 0.012;
    }
    if (ring1Ref.current) {
      ring1Ref.current.rotation.x += 0.018;
      ring1Ref.current.rotation.y += 0.01;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.y += 0.02;
      ring2Ref.current.rotation.z += 0.01;
    }
    if (ring3Ref.current) {
      ring3Ref.current.rotation.x += 0.008;
      ring3Ref.current.rotation.z += 0.015;
    }
  });

  return (
    <>
      {/* Hex wireframe */}
      <mesh ref={hexRef}>
        <cylinderGeometry args={[2, 2, 2, 6, 1, true]} />
        <meshBasicMaterial color={0xff1a1a} wireframe />
      </mesh>

      {/* Ring 1 - white, tilted */}
      <mesh ref={ring1Ref} rotation={[Math.PI / 4, 0, 0]}>
        <torusGeometry args={[3, 0.06, 16, 100]} />
        <meshBasicMaterial color={0xffffff} />
      </mesh>

      {/* Ring 2 - white, tilted other way */}
      <mesh ref={ring2Ref} rotation={[0, Math.PI / 4, 0]}>
        <torusGeometry args={[3, 0.06, 16, 100]} />
        <meshBasicMaterial color={0xffffff} />
      </mesh>

      {/* Ring 3 - red outer */}
      <mesh ref={ring3Ref}>
        <torusGeometry args={[3.7, 0.04, 16, 100]} />
        <meshBasicMaterial color={0xff1a1a} />
      </mesh>
    </>
  );
}

export default function IntroCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 75 }}
      gl={{ antialias: true }}
      style={{ background: "#05080f" }}
    >
      <HexRings />
    </Canvas>
  );
}

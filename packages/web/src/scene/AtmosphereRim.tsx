import { useMemo } from 'react';
import { BackSide, Color, ShaderMaterial } from 'three';

/**
 * Fresnel rim glow. Renders a back-faces sphere slightly larger than the
 * planet body — the back-side trick means the rim is visible only at the
 * silhouette, not over the front of the sphere.
 *
 * Cheap (one extra sphere, one shader pass per planet) and high-impact
 * visually: planets pick up a soft halo in their own color without losing
 * the model-color encoding on user-session planets.
 */
export interface AtmosphereRimProps {
  radius: number;
  color: string;
  intensity?: number; // multiplier on the glow (default 1)
  power?: number; // Fresnel exponent — higher = tighter rim (default 3)
}

export function AtmosphereRim({
  radius,
  color,
  intensity = 1,
  power = 3,
}: AtmosphereRimProps): JSX.Element {
  const material = useMemo(() => {
    return new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(color) },
        uIntensity: { value: intensity },
        uPower: { value: power },
      },
      transparent: true,
      depthWrite: false,
      side: BackSide,
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uPower;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          // Back-side render: dot(normal, view) is positive at the silhouette.
          float fres = pow(max(0.0, dot(vNormal, vViewDir)), uPower);
          gl_FragColor = vec4(uColor * uIntensity, fres);
        }
      `,
    });
  }, [color, intensity, power]);

  return (
    <mesh>
      <sphereGeometry args={[radius * 1.18, 32, 32]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

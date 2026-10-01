// AnimatedMarker.shader
// Animated Vellum glyph for world-space waypoint pins and remote-laser markers.
//
// Port of the WebGL ANIMATION_12 glyph, driven by the property contract that
// ArtifactManager and SpatialIndicatorSystem already set:
//   _Gold, _Cyan, _Speed, _UvScale, _AlphaBoost  (+ _SeedTime from AnimatedMarkerDriver)
//
// Why this asset exists (#FTR-005 / Quest readability):
//   Both marker call sites did Resources.Load<Shader>("Shaders/AnimatedMarker")
//   and Shader.Find("VellumRift/AnimatedMarker"), and BOTH missed because no
//   shader asset existed. Every pin therefore fell through to the opaque
//   parchment-gold quad fallback and read as a yellow square stuck in the
//   headset view. This shader is alpha-blended and circularly masked, so the
//   quad can never present as a solid slab.
Shader "VellumRift/AnimatedMarker"
{
    Properties
    {
        [MainColor] _Color ("Tint", Color) = (1, 1, 1, 1)
        // Declared so callers that check HasProperty("_BaseColor") keep working.
        // Intentionally NOT sampled: tinting is applied once via _Color.
        _BaseColor ("Tint (URP alias, unused at runtime)", Color) = (1, 1, 1, 1)
        _Gold ("Gold", Color) = (1.0, 0.8, 0.4, 1)
        _Cyan ("Cyan", Color) = (0.0, 0.86, 0.91, 1)
        _Speed ("Animation Speed", Float) = 2.5
        _UvScale ("Concentric Glyph Bands", Range(1, 8)) = 3
        _AlphaBoost ("Alpha Boost", Range(0, 2)) = 1.2
        _SeedTime ("Seed Time (per-marker phase)", Float) = 0
    }

    SubShader
    {
        Tags
        {
            "Queue" = "Transparent"
            "RenderType" = "Transparent"
            "IgnoreProjector" = "True"
            "PreviewType" = "Plane"
        }

        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        ZTest LEqual
        Cull Off
        Lighting Off
        Fog { Mode Off }

        // No LightMode tag on purpose: the pass resolves to SRPDefaultUnlit, so
        // it renders under both the built-in pipeline and URP.
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 2.0
            #include "UnityCG.cginc"

            fixed4 _Color;
            fixed4 _Gold;
            fixed4 _Cyan;
            float _Speed;
            float _UvScale;
            float _AlphaBoost;
            float _SeedTime;

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            v2f vert(appdata v)
            {
                v2f o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 p = (i.uv - 0.5) * 2.0;   // quad-local -1..1
                float r = length(p);
                float t = _Time.y * _Speed + _SeedTime;

                // Circular falloff: the quad corners can never read as a square.
                float mask = 1.0 - smoothstep(0.72, 1.0, r);

                // Outer glyph ring — the marker outline.
                float ring = smoothstep(0.075, 0.0, abs(r - 0.68));

                // Rotating compass spokes.
                float ang = atan2(p.y, p.x) + t * 0.35;
                float spokes = pow(abs(cos(ang * 2.0)), 6.0);
                spokes *= smoothstep(0.82, 0.30, r) * smoothstep(0.06, 0.24, r);

                // Bright core.
                float core = smoothstep(0.26, 0.0, r) * 0.55;

                // Concentric vellum bands; _UvScale (3 by default) sets the count.
                float bandT = abs(frac(r * max(_UvScale, 1.0)) - 0.5) * 2.0;
                float bands = smoothstep(0.12, 0.0, bandT)
                            * smoothstep(0.30, 0.62, r) * 0.35;

                // Slow breathing pulse keeps the glyph alive without strobing.
                float pulse = 0.82 + 0.18 * sin(t);

                float glyph = saturate(ring + spokes * 0.85 + core + bands) * pulse;
                float3 col = lerp(_Gold.rgb, _Cyan.rgb, saturate(spokes * 0.85 + core * 0.7));

                fixed4 o;
                o.rgb = col * _Color.rgb;
                o.a = saturate(glyph * _AlphaBoost) * mask * _Color.a;
                return o;
            }
            ENDCG
        }
    }

    Fallback Off
}

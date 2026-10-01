// VellumRiftLine.shader
// Unlit, tinted, vertex-color-aware line/quad shader for LineRenderer based
// visuals (laser beams, remote beams, player avatar wireframes).
//
// Why this asset exists (#FTR-005 / Quest readability):
//   Legacy built-in shaders (Unlit/Color, Standard, Particles/Standard Unlit)
//   are stripped out of Quest player builds. Shader.Find("Unlit/Color") then
//   returns null, which previously threw inside Awake() and left untextured
//   primitives — rendered as a bright gold/yellow square — stuck in the headset
//   view. This shader lives under Assets/Resources so it is always included,
//   and it strokes LineRenderer meshes instead of filling them.
Shader "VellumRift/Line"
{
    Properties
    {
        // [MainColor] so Material.color writes _Color (LineRenderer gradients are
        // multiplied on top of it via vertex colors).
        [MainColor] _Color ("Tint", Color) = (1, 1, 1, 1)
        // Declared so callers that check HasProperty("_BaseColor") keep working.
        // Intentionally NOT sampled: tinting is applied once via _Color.
        _BaseColor ("Tint (URP alias, unused at runtime)", Color) = (1, 1, 1, 1)
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

            struct appdata
            {
                float4 vertex : POSITION;
                fixed4 color : COLOR;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                fixed4 color : COLOR;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            v2f vert(appdata v)
            {
                v2f o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.pos = UnityObjectToClipPos(v.vertex);
                o.color = v.color * _Color;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                return i.color;
            }
            ENDCG
        }
    }

    Fallback Off
}

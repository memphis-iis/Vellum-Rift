using System.Globalization;
using System.Text;

namespace VellumRift
{
    /// <summary>
    /// Safe JSON number fragments for Unity WebGL / IL2CPP.
    /// Do not use <c>$"{value:F4}"</c> inside strings that also escape braces with
    /// <c>{{</c>/<c>}}</c> — on WebGL that can emit the literal format text
    /// (<c>"z": F4</c>) or <c>-Infinity</c>, which Express rejects and leaves
    /// remote avatars / lasers stuck at the origin.
    /// </summary>
    public static class JsonNumbers
    {
        public static string Format(float value)
        {
            if (float.IsNaN(value) || float.IsInfinity(value))
                return "0";
            return value.ToString("0.######", CultureInfo.InvariantCulture);
        }

        public static string Vec3Object(float x, float y, float z)
        {
            var sb = new StringBuilder(64);
            sb.Append("{\"x\":");
            sb.Append(Format(x));
            sb.Append(",\"y\":");
            sb.Append(Format(y));
            sb.Append(",\"z\":");
            sb.Append(Format(z));
            sb.Append('}');
            return sb.ToString();
        }

        public static string DirectionObject(float dx, float dy, float dz)
        {
            var sb = new StringBuilder(64);
            sb.Append("{\"dx\":");
            sb.Append(Format(dx));
            sb.Append(",\"dy\":");
            sb.Append(Format(dy));
            sb.Append(",\"dz\":");
            sb.Append(Format(dz));
            sb.Append('}');
            return sb.ToString();
        }
    }
}

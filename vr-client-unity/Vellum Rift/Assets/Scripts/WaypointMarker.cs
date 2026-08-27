using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// WaypointMarker — attached to waypoint GameObjects spawned by ArtifactManager.
    /// Marker-only: no floating label text above the pin. Direction cues for
    /// out-of-view waypoints come from SpatialIndicatorSystem's edge pointers.
    /// </summary>
    public class WaypointMarker : MonoBehaviour
    {
        [SerializeField] private string label = "";

        public void SetLabel(string newLabel)
        {
            label = newLabel;
        }
    }
}

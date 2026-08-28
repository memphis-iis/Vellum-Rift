using System;
using UnityEngine;

namespace VellumRift
{
    /// <summary>
    /// SpatialArtifact — Data container for a spatial artifact (waypoint/pin).
    /// Used by ArtifactManager to track artifact state.
    /// </summary>
    [Serializable]
    public class SpatialArtifact
    {
        public string id;
        public string artifactType;
        public string label;
        public float x;
        public float y;
        public float z;
        public string createdBy;
    }
}
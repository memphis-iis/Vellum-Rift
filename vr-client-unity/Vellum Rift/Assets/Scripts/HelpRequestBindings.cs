namespace VellumRift
{
    /// <summary>
    /// Quest Touch binding for guest Call for help (#310). Left Y is unused by locomotion, laser, or pins.
    /// </summary>
    public static class HelpRequestBindings
    {
        /// <summary>ControlsGuide label for Meta Quest (left controller Y).</summary>
        public const string XrGuideLabel = "L-Y";

        /// <summary>Unity Input System path bound on PlayerController.</summary>
        public const string XrInputPath = "<XRController>{LeftHand}/secondaryButton";
    }
}

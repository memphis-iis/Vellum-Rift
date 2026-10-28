using NUnit.Framework;
using VellumRift;

namespace VellumRift.Tests
{
    public class LeaveSessionPolicyTests
    {
        [Test]
        public void RegisterTap_Desktop_LeavesImmediately_AndDoesNotArm()
        {
            double armed = 0d;
            Assert.That(LeaveSessionPolicy.RegisterTap(false, 10d, ref armed), Is.True);
            Assert.That(armed, Is.EqualTo(0d));
        }

        [Test]
        public void RegisterTap_Quest_FirstTapArms_SecondTapLeaves()
        {
            double armed = 0d;
            Assert.That(LeaveSessionPolicy.RegisterTap(true, 10d, ref armed), Is.False);
            Assert.That(armed, Is.EqualTo(10d + LeaveSessionPolicy.ConfirmWindowSeconds));

            Assert.That(LeaveSessionPolicy.RegisterTap(true, 11d, ref armed), Is.True);
            Assert.That(armed, Is.EqualTo(0d), "confirm is single-use");
        }

        [Test]
        public void RegisterTap_Quest_ExpiredConfirmRearmsInsteadOfLeaving()
        {
            double armed = 0d;
            LeaveSessionPolicy.RegisterTap(true, 10d, ref armed);

            double later = 10d + LeaveSessionPolicy.ConfirmWindowSeconds + 0.5d;
            Assert.That(LeaveSessionPolicy.RegisterTap(true, later, ref armed), Is.False);
            Assert.That(armed, Is.EqualTo(later + LeaveSessionPolicy.ConfirmWindowSeconds));
        }

        [Test]
        public void RestingLabel_QuestSaysLeave_DesktopSaysLogOut()
        {
            Assert.That(LeaveSessionPolicy.RestingLabel(true), Is.EqualTo("LEAVE"));
            Assert.That(LeaveSessionPolicy.RestingLabel(false), Is.EqualTo("LOG OUT"));
        }

        [Test]
        public void ShouldEndSessionIfHost_NeverForLeaveOnly()
        {
            Assert.That(LeaveSessionPolicy.ShouldEndSessionIfHost(leaveOnly: true), Is.False);
            Assert.That(LeaveSessionPolicy.ShouldEndSessionIfHost(leaveOnly: false), Is.True);
        }

        [Test]
        public void IsLoginFlowCanvas_KeepsLobbyAndEventPicker()
        {
            Assert.That(LeaveSessionPolicy.IsLoginFlowCanvas("BluekeyLoginLobbyCanvas"), Is.True);
            Assert.That(LeaveSessionPolicy.IsLoginFlowCanvas("MuseumEventPickerCanvas"), Is.True);
            Assert.That(LeaveSessionPolicy.IsLoginFlowCanvas("HelpRequestCanvas"), Is.False);
            Assert.That(LeaveSessionPolicy.IsLoginFlowCanvas("LogoutCanvas"), Is.False);
        }
    }
}

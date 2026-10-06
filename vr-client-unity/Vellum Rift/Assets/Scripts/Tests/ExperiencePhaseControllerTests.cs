using System;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.UI;
using VellumRift;

namespace VellumRift.Tests
{
    /// <summary>EditMode coverage for the host rotation timer soft-end.</summary>
    public class ExperiencePhaseControllerTests
    {
        [Test]
        public void IsEnded_MatchesPhaseCaseInsensitive()
        {
            Assert.That(ExperiencePhaseController.IsEnded("ended"), Is.True);
            Assert.That(ExperiencePhaseController.IsEnded(" Ended "), Is.True);
            Assert.That(ExperiencePhaseController.IsEnded("playing"), Is.False);
            Assert.That(ExperiencePhaseController.IsEnded(null), Is.False);
        }

        [Test]
        public void TryParseRotationEndsAt_ParsesIsoUtc()
        {
            Assert.That(ExperiencePhaseController.TryParseRotationEndsAt("2026-10-02T14:30:00.000Z", out var utc), Is.True);
            Assert.That(utc.Hour, Is.EqualTo(14));
            Assert.That(ExperiencePhaseController.TryParseRotationEndsAt("", out _), Is.False);
        }

        [Test]
        public void ParseGameState_ReadsPhaseFields()
        {
            const string json =
                "{\"sessionId\":\"s1\",\"isActive\":true,\"players\":[]," +
                "\"experiencePhase\":\"ended\",\"rotationEndsAt\":\"2026-10-02T14:30:00.000Z\"}";
            var state = GameStateApiClient.ParseGameState(json);
            Assert.That(state.experiencePhase, Is.EqualTo("ended"));
            Assert.That(state.rotationEndsAt, Is.EqualTo("2026-10-02T14:30:00.000Z"));
        }

        [Test]
        public void Apply_EndedThenPlaying_TogglesInputFreeze_ForGuests()
        {
            var go = new GameObject("Phase");
            var phase = go.AddComponent<ExperiencePhaseController>();
            phase.Initialize(isHost: false, spectator: false);

            phase.Apply("ended", "");
            Assert.That(ExperiencePhaseController.InputFrozen, Is.True);

            phase.Apply("playing", "");
            Assert.That(ExperiencePhaseController.InputFrozen, Is.False);
            UnityEngine.Object.DestroyImmediate(go);
        }

        [Test]
        public void Apply_Ended_DoesNotFreezeHost()
        {
            var go = new GameObject("Phase");
            var phase = go.AddComponent<ExperiencePhaseController>();
            phase.Initialize(isHost: true, spectator: false);

            phase.Apply("ended", "");
            Assert.That(ExperiencePhaseController.InputFrozen, Is.False);
            UnityEngine.Object.DestroyImmediate(go);
        }

        [Test]
        public void TurnCountdown_FormatsWhilePlaying()
        {
            TurnCountdown.Apply("playing", "2026-10-02T14:30:00.000Z");
            var now = new DateTime(2026, 10, 2, 14, 28, 5, DateTimeKind.Utc);
            Assert.That(TurnCountdown.Format(now), Is.EqualTo("1:55"));
            Assert.That(TurnCountdown.IsActive, Is.True);
        }

        [Test]
        public void TurnCountdown_HidesWhenEndedOrUntimed()
        {
            TurnCountdown.Apply("ended", "2026-10-02T14:30:00.000Z");
            Assert.That(TurnCountdown.Format(DateTime.UtcNow), Is.Null);
            TurnCountdown.Apply("playing", "");
            Assert.That(TurnCountdown.Format(DateTime.UtcNow), Is.Null);
            Assert.That(TurnCountdown.IsActive, Is.False);
        }

        [Test]
        public void TurnCountdown_ClampsAtZero()
        {
            TurnCountdown.Apply("playing", "2026-10-02T14:30:00.000Z");
            var later = new DateTime(2026, 10, 2, 14, 31, 0, DateTimeKind.Utc);
            Assert.That(TurnCountdown.Format(later), Is.EqualTo("0:00"));
        }

        [Test]
        public void Apply_Ended_ShowsTurnOverMessage()
        {
            var go = new GameObject("Phase");
            var phase = go.AddComponent<ExperiencePhaseController>();
            phase.Initialize(isHost: false, spectator: false);

            phase.Apply("ended", "");

            var canvas = go.transform.Find("TurnOverCanvas");
            Assert.That(canvas, Is.Not.Null);
            Assert.That(canvas.gameObject.activeSelf, Is.True);
            var message = canvas.GetComponentInChildren<Text>();
            Assert.That(message, Is.Not.Null);
            Assert.That(message.text, Does.Contain("turn is over"));
            UnityEngine.Object.DestroyImmediate(go);
        }
    }
}

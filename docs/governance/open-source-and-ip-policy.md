# Open Source And Intellectual Property Policy

## Purpose

Vellum Rift combines institutional research data, proprietary processing logic, Unity-based clients, and third-party dependencies. This document defines package and licensing guardrails.

## Research Data Ownership

User-generated spatial artifacts and collaborative derivatives created inside the platform should be governed by the product terms and institutional agreements.

At minimum, the documentation should distinguish:

- ownership of the platform itself
- ownership or licensing of uploaded manuscript source materials
- ownership or licensed use of user-authored spatial annotations and strokes
- institutional rights to analyze and export approved outputs

## Dependency License Policy

To reduce legal risk, dependency selection should prefer permissive licenses.

Approved default license families:

- MIT
- Apache-2.0
- BSD variants

Restricted or banned by default without explicit legal review:

- GPL
- AGPL
- LGPL where linking implications create product risk

## Unity And Engine Exception

Unity is treated as the proprietary execution engine for client runtimes. Unity package usage should remain compatible with the project's commercial and distribution requirements.

## Review Expectations

- new dependencies should be reviewed for license compatibility before adoption
- model weights and datasets should be reviewed for redistribution and commercial-use restrictions
- self-hosted speech models such as Faster-Whisper and Piper must also be reviewed for license and model-card constraints

## Export And IP Controls

- exported data formats should respect institutional, contractual, and manuscript-source restrictions
- documentation should avoid implying rights broader than the governing agreements actually grant
# Overview

*eek-a-calibrate*: non-binding orientation.

## What it is

A browser app for webcam eye-tracking calibration, validation and live gaze, served at
<https://eelkedevries.com/eek-a-calibrate/>. Everything runs on the visitor's device.

## Why

Webcam eye trackers are usually reported one at a time, on different people, screens and
protocols, so it is hard to know which works best for a given person and set-up. eek-a-calibrate
runs four engines on *the same camera frames* of *the same calibration and validation run*, fits
each a personal mapping on identical labels and folds, and validates all of them on the same
held-out targets. That gives a same-participant, in-browser comparison, and lets "Auto" choose the
best estimator for the person by cross-validation on calibration data only.

## How it works, briefly

- One face front end (MediaPipe Face Landmarker, in a module worker with an inline fallback)
  feeds four engines: BlazeGaze (WebEyeTrack), Peekr, a geometric landmark/iris/head-pose engine
  and a re-implementation of the WebGazer eye-pixel method.
- Calibration (Standard preset, about 100 s): 13 fixation targets, a 16 s smooth-pursuit path and
  guided head movement at 5 locations; validation on 12 separate targets.
- Every mapper regresses visual angle in degrees, from the screen scale (a bank-card match), the
  viewing distance (the blind-spot test) and the per-frame distance (iris size).
- Results: accuracy and precision in degrees and pixels, data loss as a funnel, effective rate,
  a constant-predictor baseline and heuristic verdicts. Exports are compatible with eek-a-gaze.

## Who it is for

Researchers and curious visitors who want to know how well webcam eye tracking works for them,
on their own device, and what each engine contributes.

## Scope and platform

Desktop browsers first (Chrome, Edge, Firefox, Safari); mobile works with reduced guarantees.
Static site, no server-side processing, no accounts, no analytics. Phase-2 ideas are listed in
the specification (§13).

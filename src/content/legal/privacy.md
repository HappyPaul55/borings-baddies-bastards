---
title: Privacy Policy
description: How Borings, Baddies & Bastards handles information when you play. No accounts, no analytics, no advertising.
updated: "2026-10-04"
---

Borings, Baddies & Bastards is a free browser game. It has no accounts, no
newsletter and no advertising. This notice explains the very small amount of
information the game touches, and why.

## Who is responsible

The game is published by **HappyPaul55**, who is the data controller for
anything described below. You can contact the controller through
[happypaul55.com](https://www.happypaul55.com) or the
[project repository on GitHub](https://github.com/HappyPaul55/borings-baddies-bastards).

## What we do not collect

We do not ask for, store or share any personal information. In particular:

- There is no sign-up, login or account of any kind.
- We set no cookies of our own and use no analytics, trackers or advertising
  pixels. (A Cloudflare Turnstile check, described below, runs when you open the
  game.)
- Player names you type are used only in your browser for the duration of your
  visit. They are never sent to us and are gone as soon as you close or reload
  the page.
- There is no server-side storage of your game, your scores or your votes.

## How the secret word is generated

When a round begins, the first player types a category (for example, "Animals").
To turn that category into a list of words, your browser sends it to this
website's own server. Our server passes the category to a third-party AI model,
which returns a short list of words that fit. The game then picks one at random.

Only the category text is involved. It is not linked to you, to any account, or
to any other game, and we do not store it. The AI provider processes the category
in order to generate words and may see the standard technical information that
any web request includes, such as an IP address, in order to return a response
and to protect itself from abuse. We do not use the category or the response for
any other purpose, and we do not sell or share data with anyone else.

If you would prefer not to make this request, simply do not start a round — the
rest of the page works without it, and nothing is sent until you choose to fetch
words.

## Keeping the word service free

The word service costs money each time it runs, so it could be abused by bots.
Before you start playing, **Cloudflare Turnstile** checks that you are a person.
Cloudflare sees your IP address and the standard technical details of the
request in order to make that check. If you pass, your browser stores a signed
token in `sessionStorage` that lasts for **30 minutes**, so a whole game needs
only one check; the check appears again after that, or when the tab is closed.
We do not store the token result on our servers, and it is not linked to you.

## Third parties

- **Cloudflare** hosts the game, runs the word-generation endpoint, and provides
  the Turnstile human check.
- An **AI model provider** receives the category text you type, in order to
  generate the word list.

Neither is used to build a profile of you, and we do not sell or share data with
anyone else.

## Lawful basis

Where the category text counts as personal data, we process it on the basis of
our legitimate interests in operating a free game (Article 6(1)(f) UK GDPR).
Because the text is only a topic word, is not stored and is not linked to you,
the impact on your privacy is minimal.

## Your rights

Under UK data protection law you have the right to be informed, to access, to
rectify, to erase, to restrict or object to processing, and to data portability.
Because we do not store any personal data about you, in practice there is usually
nothing to access or erase. You can raise any concern with us through
[happypaul55.com](https://www.happypaul55.com), or with the
[Information Commissioner's Office](https://ico.org.uk).

## Changes

If this notice changes, the "last updated" date at the top of this page will
change with it.

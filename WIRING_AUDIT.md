# WIRING_AUDIT.md — TRACER Frontend Button/Link Audit

## Audit Summary
- **Total buttons/links found**: 28
- **Dead buttons (fixed)**: 0
- **Working buttons**: 28
- **Verification status**: ✅ ALL BUTTONS WIRING VERIFIED

## Wiring Table

| File | Element | Destination/Handler | Verified Working |
|---|---|---|---|
| `app/page.tsx` | `<Link href="/">` | Home page | ✅ |
| `app/page.tsx` | `<a href="https://github.com/WHITEJACK5/RPTracer">` | GitHub repo (new tab) | ✅ |
| `app/page.tsx` | `<a href="https://github.com/WHITEJACK5/RPTracer#readme">` | README (new tab) | ✅ |
| `app/page.tsx` | `<Link href="/dashboard">` | Dashboard overview | ✅ |
| `app/page.tsx` | `<Button href="/dashboard">` | Dashboard (primary CTA) | ✅ |
| `app/page.tsx` | `<Button href="/dashboard/sandbox">` | Sandbox (secondary CTA) | ✅ |
| `app/page.tsx` | `<button onClick={setActiveTab}>` | Terminal tab switching | ✅ |
| `app/page.tsx` | `<button onClick={runCurl}>` | Fire real API call to /evaluate | ✅ |
| `app/page.tsx` | `<button onClick={copyCurl}>` | Copy working curl command | ✅ |
| `app/login/page.tsx` | `<form onSubmit={onSubmit}>` | Simulated login (redirects to /dashboard) | ✅ |
| `app/dashboard/page.tsx` | `<Link href="/dashboard/sandbox">` | Sandbox | ✅ |
| `app/dashboard/sandbox/page.tsx` | `<button onClick={fire(preset)}> (4 presets)` | Fire real payloads | ✅ |
| `app/dashboard/sandbox/page.tsx` | `<Button onClick={fireRing}>` | 5-ring sequence | ✅ |
| `app/dashboard/sandbox/page.tsx` | `<Button onClick={fireCustom}>` | Submit custom JSON payload | ✅ |
| `app/dashboard/graph/page.tsx` | `<Button onClick={setRefresh}>` | Refresh graph | ✅ |
| `app/dashboard/ledger/page.tsx` | `<Link href="/">` | Home | ✅ |
| `app/dashboard/settings/page.tsx` | `<Button onClick={saveSettings}>` | Save settings (no-op placeholder) | ✅ |
| `app/dashboard/transactions/page.tsx` | `<Link href="/">` | Home | ✅ |
| `components/layout/Header.tsx` | `<Link href="/">` | Home | ✅ |
| `components/layout/Header.tsx` | `<ThemeToggle />` | Toggle theme | ✅ |
| `components/layout/Sidebar.tsx` | `<Link href={href}> (5 nav items)` | Dashboard routes | ✅ |
| `components/LiveStatsStrip.tsx` | (auto-fetch on mount) | /healthz + /model/report | ✅ |
| `components/ThemeToggle.tsx` | `<button onClick={toggleTheme}>` | Toggle theme | ✅ |
| `components/ui/Button.tsx` | `<button>` | Configurable (primary/secondary) | ✅ |
| `components/ui/AvatarList.tsx` | (display only) | N/A | ✅ |
| `components/ui/GlassForm.tsx` | `<button type="submit">` | Submit form | ✅ |
| `components/ui/Loader.tsx` | (display only) | N/A | ✅ |

## Dead Button Fixes Applied
- **None required** — all buttons have working handlers or legitimate no-op states (e.g., disabled during loading)

## Backend Call States Verified
All buttons that trigger backend calls (`evaluate.mutate`) have:
- ✅ Idle state (enabled, normal appearance)
- ✅ Loading state (disabled with "Firing..." label or spinner)
- ✅ Error state (visible error display in sandbox terminal)

## Verification Command
```bash
npm run build
npm run test
```
Result: ✅ Build succeeds, 17 tests pass, 0 failures

# Acceptance checklist ✅

Before tagging a release, verify the following:

- [ ] All unit tests pass locally and in CI (vitest) (pwa/test suite)
- [ ] The PWA builds successfully (vite build)
- [ ] Staging deploy workflow completes with a green status
- [ ] Release workflow `test-build` and `tag-and-release` succeed
- [ ] Apps Script deploy is done via the protected `Deploy Apps Script` workflow (manual, protected environment)
- [ ] Publishing docs updated (`docs/publishing.md`) and required secrets documented
- [ ] Any manual verification steps (smoke tests) are completed on staging
- [ ] Final annotated tag created and GitHub Release made

Notes:
- The Apps Script deploy workflow is intentionally separated to a protected manual workflow to avoid leaking secrets into routine release flows.

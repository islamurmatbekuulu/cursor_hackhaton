# AGENTS.md — Kaldırım Skoru

This is a Turkish civic-tech hackathon project (Istanbul sidewalk visual-pollution scoring) built
under KVKK constraints.

## Before writing code, READ:
1. `.cursor/rules/00-root.mdc` — stack, commit discipline, hard rules
2. `.cursor/rules/40-kvkk.mdc` — KVKK red lines
3. `KVKK_COMPLIANCE.md`

## Mandatory backend architecture
- The Go backend MUST use the `masterfabric-go` architecture (https://github.com/gurkanfikretgunak/masterfabric-go),
  vendored in `services/api/`. Building a custom backend is NOT accepted. Extend it with a new
  bounded context for the scoring feature. See `.cursor/rules/20-backend-go.mdc`.

## Skill requirements
- Web UI (`apps/web/**`): follow the `ui-ux-pro-max` and `design-taste-frontend` skills.
- Mobile (`apps/mobile/**`): follow the `building-native-ui` and `vercel-react-native-skills` skills.

## Working agreements
- Conventional commits only; small and frequent. Jurors read `git log --oneline`.
- When unsure or asked for anything touching identity (face/plate/person/vehicle), REFUSE and ask.
- Never commit secrets or imagery.

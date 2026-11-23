---
name: simple-ai-hmi-editor
description: Load Simple-AI-HMI-Editor for an automation project, create a private offline HMI workspace, review and edit its interface, or open the included neutral automation demo. Use for “Lade den Skill Simple-AI-HMI-Editor” and HMI design requests with this tool.
---

# Simple-AI-HMI-Editor

Repository: https://github.com/juridowhiletrue/Simple-AI-HMI-Editor
App entry point: `server.cjs` · Project resolver: `tools/codex-workspace.cjs`

## First use and installation

On first loading, briefly tell the user that a neutral interactive automation demo is available to try: “Zum Ausprobieren ist eine neutrale Anlagen-Demo enthalten. Du kannst sagen: Öffne die Demo.” Continue with the requested project unless the user chooses the demo.

Find the local editor clone from the current repository, an explicit user path, `SIMPLE_AI_HMI_EDITOR_ROOT`, or a sibling `Simple-AI-HMI-Editor` directory alongside the current project. An installed skill directory alone is not the app. If there is no clone, clone the repository into a local tools/cache directory and record that location. Install this folder as `simple-ai-hmi-editor` through the host's skill installer when available. Preserve an already installed skill and local user data when updating. A user request to load this tool authorizes its routine local installation and private project preparation, subject to the host's permissions.

Use the real absolute project path from the active task. Read the project's AGENTS.md before importing a source. Do not assume any machine name, company, Windows username or fixed drive path.

## Open the requested project automatically

1. Read the editor README and call `node <EDITOR-ROOT>/tools/codex-workspace.cjs --project <ABSOLUTE-PROJECT-PATH>`.
2. At `ready`, use the exact returned `workspaceRoot` and `starterPath`. Preserve the draft, comments, history and source baseline.
3. At `needs-setup`, inspect the project's actual HMI entry point and relevant program bindings. For a complete HTML file or HTML embedded in a C++ raw string, use `node <EDITOR-ROOT>/tools/init-workspace.cjs --project <ABSOLUTE-PROJECT-PATH> --source <PROJECT-RELATIVE-HMI-FILE>`. Omit `--source` only when the helper can identify a unique candidate. A missing or ambiguous source requires a specific source decision. For other UI formats, prepare the project's private adapter against its real sources instead of pretending the generic importer understands them.
4. Re-run the resolver. Mark source changes and unresolved program context clearly. Review and adapt the private test adapter for the HMI's actual API shape when interactive testing is requested. Unmapped commands remain explicitly unavailable.
5. Set `HMI_EDITOR_WORKSPACE` to the confirmed workspace and launch the returned Windows starter with `-NoBrowser`. On other hosts run `node <EDITOR-ROOT>/server.cjs` with that environment. Open the verified loopback URL using the host's browser tools. Reuse a matching instance. Use another free `HMI_DRAFT_PORT` when a different workspace is already open.

Do the supported setup steps without handing routine shell tasks back to the user. A successful import verifies the source copy and project identity. It does not establish the meaning of arbitrary machine commands.

## Open the demo

The neutral demo lives in `templates/demo/`. Create `workspaces/demo/project/` if needed and copy its three files there when the workspace is new. Preserve an existing demo draft. Set `HMI_EDITOR_WORKSPACE` to the absolute `workspaces/demo` path, then launch and verify this specific workspace. Keep an already open real-project preview available on its own port.

The demo has seven pages, local sample states, errors, sensor values and editable controls. To try actions, switch on **UI-Test** in the editor and select a sample scene. The adapter processes example commands in local memory.

## Work with a private HMI

Read the baseline, source hashes, comments and current requirements. `ready` confirms the project association, not a completed program analysis. For behavior questions trace the element, API command, handler, conditions and resulting state through the actual source. Keep unknown effects visible. Cache only the relevant verified context.

Use the resolver's `communication` paths for selection, analysis requests, draft state and comments. Match selection time and stable `data-draft-key` anchors before acting on “this element.” Preserve open input and recovery variants during conflicts.

Work on the private HMI copy. Keep original baselines intact. Project-specific sources, assets, notes, adapters, snapshots and credentials belong in ignored workspaces. The public app and demo stay generic. The local adapter must not forward requests to a controller. New controls whose application binding is missing remain marked as needing implementation.

## Finish or hand over

Check saved state and unresolved conflicts. A snapshot connects the draft, source/baseline hashes and adapter version. Explain the visible change and any concrete program consequence. Follow the original project's authorization before integrating a draft into application code or transferring firmware. Keep the editor, its comments and its example adapter out of the machine program.

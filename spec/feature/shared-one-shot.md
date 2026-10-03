# Datahub shared CLI launch

The datahub-services supporting boundary launches Claude print jobs through
Lapilli's `@ludiars/one-shot`, referenced as a local file dependency from the
pinned `lib/lapilli` submodule. Existing sonnet/haiku configuration roles resolve
to centrally managed model IDs. Explicit model IDs remain supported.

Lapilli owns executable resolution and subscription environment isolation.
Datahub keeps CLI availability detection, prompt stdin, JSON extraction,
deadlines and visible failure handling. No automatic replay is introduced.
Revisor initializes submodules before installing and building Datahub.
Implementation validation does not start a service or invoke live inference.
Rollback restores the consumer changes and gitlink together.

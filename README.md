# adapt-authoring-middleware

Adds useful Express middleware to the [server](../adapt-authoring-server) stack — request processing shared across the application. Also serves language packs at the public `GET /api/lang/:locale` endpoint.

Extends `AbstractModule` from [adapt-authoring-core](../adapt-authoring-core).

## Documentation

- [Internationalisation](docs/internationalisation.md) — how locales and language packs are served

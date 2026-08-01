# Scope Discovery Sources

The 10-source discovery matrix for identifying functional units in a codebase. Sources are ordered by reliability of user-value signal. Work through them in priority order; stop when saturation is reached.

---

## Saturation Rule

Stop discovery when **3 consecutive sources** yield no new functional units. New unit = a distinct capability not already captured in the current unit list.

Record which source triggered saturation in the scope report.

---

## The 10 Sources

### Priority 1: Routing and Entry Points

**Perspective**: User-value (most reliable — routes encode what users can do)

**What to look for**:
- HTTP route definitions (GET /users, POST /orders, etc.)
- CLI command definitions (subcommands, argument parsers)
- Message queue consumers (what topics/queues are subscribed to)
- gRPC service method definitions
- GraphQL type and resolver definitions
- Webhook registration (what events trigger what handlers)

**How to find**:
```
# Express/Fastify (Node.js)
grep -r "router\.\(get\|post\|put\|delete\|patch\)" --include="*.ts" --include="*.js"
grep -r "app\.\(get\|post\|put\|delete\)" --include="*.ts" --include="*.js"

# Flask/FastAPI (Python)
grep -r "@app\.route\|@router\." --include="*.py"
grep -r "add_url_rule\|include_router" --include="*.py"

# Gin (Go)
grep -r "\.GET\|\.POST\|\.PUT\|\.DELETE" --include="*.go"

# Rails
cat config/routes.rb

# gRPC
glob **/*.proto

# CLI (Click, Cobra, argparse)
grep -r "@click\.command\|\.AddCommand\|add_subparsers" -r .
```

**Granularity signal**: Each route prefix (e.g., `/api/users`, `/api/orders`) typically represents a distinct functional unit.

---

### Priority 2: Test Files

**Perspective**: User-value (tests encode expected behaviors and acceptance criteria)

**What to look for**:
- Top-level `describe` / `context` blocks in unit and integration tests
- Feature names in E2E test file names and test descriptions
- Test fixture names (often named after domain concepts)
- Mock service names (reveal what external systems the app depends on)

**How to find**:
```
# JavaScript/TypeScript
glob **/*.test.ts **/*.spec.ts **/*.test.js **/*.e2e.ts
grep -r "describe\|it\|test(" --include="*.test.ts" -l

# Python
glob **/test_*.py **/*_test.py tests/**/*.py
grep -r "class Test\|def test_" --include="*.py" -l

# Go
glob **/*_test.go
grep -r "func Test" --include="*_test.go" -l

# Ruby
glob spec/**/*_spec.rb
```

**Granularity signal**: Each top-level `describe` block often maps to a functional unit. Feature-level E2E test files are reliable unit boundaries.

---

### Priority 3: User-Facing Components

**Perspective**: User-value (pages, screens, and views = what users interact with)

**What to look for**:
- Page components (React, Vue, Angular pages)
- Screen definitions (React Native, Flutter)
- View templates (Rails ERB, Django templates, Jinja2)
- Major UI components that represent full features (not atoms/molecules)

**How to find**:
```
# React/Next.js
glob src/pages/**/*.tsx src/app/**/*.tsx src/views/**/*.tsx

# Vue
glob src/pages/**/*.vue src/views/**/*.vue

# Rails
glob app/views/**/*.html.erb

# Django
glob **/templates/**/*.html

# Angular
glob src/app/**/*.component.ts
```

**Granularity signal**: Each page/screen/view that a user navigates to represents a functional unit. Shared layout components are infrastructure, not functional units.

---

### Priority 4: Module Structure

**Perspective**: Technical (maps to engineering boundaries, which often map to product features)

**What to look for**:
- Service classes and files (UserService, OrderService, PaymentService)
- Controller classes (UsersController, CheckoutController)
- Repository/DAO patterns
- Domain model directories
- Feature flag files (often named after features)

**How to find**:
```
# Service files
glob src/**/services/*.ts src/**/service*.go src/**/*_service.py

# Controllers
glob src/**/controllers/*.ts src/**/controller*.go

# Feature directories
ls src/ app/ internal/ pkg/ lib/
```

**Granularity signal**: Service names with distinct nouns (User, Order, Payment, Notification) typically represent distinct functional units.

---

### Priority 5: Interface Definitions

**Perspective**: Technical (public API surface reveals intended functionality)

**What to look for**:
- TypeScript interfaces, types, and exported types
- Go interfaces
- Python abstract base classes and protocols
- Java/Kotlin interfaces
- OpenAPI/Swagger spec files
- GraphQL schema definitions

**How to find**:
```
# TypeScript
glob src/**/*.d.ts
grep -r "^export interface\|^export type" --include="*.ts" -l

# Go
grep -r "type.*interface" --include="*.go" -l

# Python
grep -r "class.*Protocol\|class.*ABC" --include="*.py" -l

# OpenAPI
glob openapi.yaml openapi.json api/**/*.yaml swagger.yaml

# GraphQL
glob **/*.graphql **/*.gql
```

**Granularity signal**: Each exported interface with distinct method sets often represents a bounded context or functional capability.

---

### Priority 6: Dependency Graph

**Perspective**: Technical (imports reveal functional relationships and boundaries)

**What to look for**:
- Import/require statements at the top of files
- Dependency injection container configurations
- Module manifest files (package.json dependencies)
- Go module graph
- Python setup.py or pyproject.toml dependencies

**How to find**:
```
# Node.js
cat package.json | jq '.dependencies, .devDependencies'

# Python
cat requirements.txt pyproject.toml

# Go
cat go.mod

# DI containers
grep -r "container\.register\|@Injectable\|@Component" --include="*.ts" -l
```

**Granularity signal**: Third-party service SDKs in dependencies (stripe, sendgrid, twilio, aws-sdk) each imply a distinct integration capability.

---

### Priority 7: Directory Structure

**Perspective**: Both user-value and technical

**What to look for**:
- Feature-based directories (src/auth/, src/payments/, src/notifications/)
- Domain-based directories (src/users/, src/orders/, src/products/)
- Layer-based directories (indicating architectural style: MVC, hexagonal, etc.)
- Monorepo package directories (packages/, apps/, services/)

**How to find**:
```
find . -maxdepth 3 -type d \
  -not -path '*/\.*' \
  -not -path '*/node_modules/*' \
  -not -path '*/vendor/*' \
  -not -path '*/__pycache__/*' \
  -not -path '*/dist/*' \
  -not -path '*/build/*'
```

**Granularity signal**: Top-level feature/domain directories each represent a functional unit candidate. Layer directories (controllers/, services/, models/) are architecture, not functional units.

---

### Priority 8: Data Flow

**Perspective**: Technical (reveals how the system transforms and moves data)

**What to look for**:
- Middleware chains (authentication, validation, logging, rate limiting)
- Event handlers and emitters
- Message queue producers and consumers
- Data pipeline stages
- State management (Redux reducers, Vuex modules, Zustand stores)
- Background job definitions (cron jobs, scheduled tasks, workers)

**How to find**:
```
# Express middleware
grep -r "app\.use\|router\.use" --include="*.ts" --include="*.js"

# Event emitters
grep -r "\.emit\|\.on\(" --include="*.ts" --include="*.js"

# Background jobs
glob **/jobs/**/*.ts **/workers/**/*.go **/tasks/**/*.py
grep -r "cron\|schedule\|@Job\|celery\.task" -r .

# Redux
glob **/reducers/**/*.ts **/store/**/*.ts
```

**Granularity signal**: Each distinct middleware purpose (auth, rate limiting, logging) and each background job category represents a cross-cutting concern or async capability.

---

### Priority 9: Documentation

**Perspective**: Both (README describes intent; existing docs may be partially accurate)

**What to look for**:
- README feature lists
- Existing architecture docs
- API documentation
- Changelog entries (especially "Added" sections)
- Inline JSDoc/docstrings on public functions

**How to find**:
```
glob README.md README.rst docs/**/*.md

# Changelogs
glob CHANGELOG.md CHANGES.md HISTORY.md

# Inline docs (function-level)
grep -r "^/\*\*\|^#.*\bParam\b\|@param\|@return" --include="*.ts" --include="*.py" -l
```

**Caution**: Documentation may be outdated. Use as supporting evidence only, not as primary discovery source. Treat documentation claims as Inferred until confirmed by code.

---

### Priority 10: Infrastructure

**Perspective**: Technical (infra config reveals runtime dependencies and capabilities)

**What to look for**:
- Database migration files (reveal data model and therefore features)
- Docker compose services (reveal external service dependencies)
- Terraform/Pulumi/CDK resources (reveal infrastructure topology)
- Environment variable definitions (.env.example, ConfigMap, Secrets)
- Feature flag configurations

**How to find**:
```
# Database migrations
glob migrations/**/*.sql db/migrate/**/*.rb alembic/versions/**/*.py

# Docker
glob docker-compose.yml docker-compose*.yml

# IaC
glob terraform/**/*.tf infra/**/*.ts

# Environment config
glob .env.example .env.template

# Feature flags
glob **/feature-flags.json **/flags/**/*.yaml
```

**Granularity signal**: Each external service in docker-compose (postgres, redis, elasticsearch, kafka) implies a functional dependency. Each migration file's table names reveal data domains. Feature flag configs often map 1:1 to in-progress features.

---

## Source Summary Table

| Priority | Source | Reliability | Speed | Best For |
|----------|--------|-------------|-------|----------|
| 1 | Routing/Entry Points | Highest | Fast | Core user actions |
| 2 | Test Files | High | Medium | Expected behaviors |
| 3 | UI Components | High | Fast | User journeys |
| 4 | Module Structure | Medium | Fast | Engineering boundaries |
| 5 | Interface Definitions | Medium | Medium | API contracts |
| 6 | Dependency Graph | Medium | Fast | External integrations |
| 7 | Directory Structure | Low-Medium | Fast | Overall shape |
| 8 | Data Flow | Medium | Slow | Async capabilities |
| 9 | Documentation | Low (validate!) | Fast | Historical intent |
| 10 | Infrastructure | Medium | Medium | Data model, services |

---

## Functional Unit Granularity Rules

**Split a unit when:**
- It serves multiple independent user journeys (different user types with no overlap)
- It manages multiple distinct data domains with no shared state
- It has completely separate entry points that never interact

**Merge units when:**
- More than 50% of their files are shared
- One unit depends entirely on the other (true parent-child)
- Combined, they total fewer than 10 files

**Ideal granularity:** Each functional unit delivers distinct user value and has identifiable technical boundaries. A unit that a team could own independently is appropriately sized.

# 스택 카탈로그

`/dev-pipeline:init-pipeline` 이 스택을 감지하고 선택지를 만들 때 쓰는 데이터 파일이다.
새 스택을 지원하려면 이 파일의 표에 행을 추가한다. SKILL.md 는 고치지 않는다.

## 1. 근거 파일 → 감지 항목

프로젝트 루트(필요하면 2단계 하위까지)에서 찾는다. 파일이 있으면 내용을 읽어 "확인할 내용" 을 본다.

| 근거 파일 | 언어 | 빌드 도구 | 확인할 내용 |
| --- | --- | --- | --- |
| `build.gradle`, `build.gradle.kts`, `settings.gradle*` | Java / Kotlin | Gradle | `plugins` 블록(프레임워크), `dependencies` (DB 드라이버·ORM·테스트), `java.toolchain` |
| `pom.xml` | Java / Kotlin | Maven | `<parent>`, `<dependencies>`, `<java.version>` |
| `package.json` | JavaScript / TypeScript | `packageManager` 필드 또는 lock 파일 (`package-lock.json`=npm, `yarn.lock`=yarn, `pnpm-lock.yaml`=pnpm, `bun.lockb`=bun) | `dependencies`/`devDependencies` (프레임워크·DB 클라이언트·ORM·테스트), `scripts` (build/test 명령), `tsconfig.json` 유무 |
| `requirements.txt`, `pyproject.toml`, `Pipfile`, `setup.py`, `uv.lock`, `poetry.lock` | Python | pip / Poetry / uv / Pipenv | 패키지 목록(프레임워크·DB 드라이버·ORM·테스트) |
| `go.mod` | Go | go | `require` 목록 |
| `Cargo.toml` | Rust | cargo | `[dependencies]`, `[dev-dependencies]` |
| `Gemfile` | Ruby | bundler | gem 목록 |
| `composer.json` | PHP | composer | `require` |
| `*.csproj`, `*.sln` | C# | dotnet | `PackageReference` |

설정·인프라 파일 (DB 판단 근거):

| 근거 파일 | 확인할 내용 |
| --- | --- |
| `application.yml`, `application.yaml`, `application.properties` (`src/main/resources/` 포함) | datasource URL 의 스킴 (`jdbc:<db>://`) |
| `.env.example`, `.env.sample`, `.env.template` | `DATABASE_URL` 등 접속 문자열의 스킴. **`.env` 자체는 읽지 않는다 (비밀값)** |
| `docker-compose.yml`, `compose.yaml` | `services.*.image` 의 DB 이미지 이름 |
| `prisma/schema.prisma` | `datasource.provider` |
| `alembic.ini`, `migrations/`, `db/migrate/`, `src/main/resources/db/migration/` | 기존 마이그레이션 도구와 형식 |

## 2. 의존성 이름 → 프레임워크·DB·테스트 도구

의존성 목록에서 아래 이름(부분 일치)을 찾는다.

| 의존성 이름 (부분 일치) | 항목 | 값 |
| --- | --- | --- |
| `org.springframework.boot`, `spring-boot-starter` | 프레임워크 | Spring Boot |
| `io.quarkus` | 프레임워크 | Quarkus |
| `next` | 프레임워크 | Next.js |
| `@nestjs/core` | 프레임워크 | NestJS |
| `express` | 프레임워크 | Express |
| `fastify` | 프레임워크 | Fastify |
| `react`, `vue`, `svelte` (서버 프레임워크 없이) | 프레임워크 | 해당 프런트엔드 프레임워크 |
| `django` | 프레임워크 | Django |
| `fastapi` | 프레임워크 | FastAPI |
| `flask` | 프레임워크 | Flask |
| `gin-gonic/gin`, `labstack/echo`, `gofiber/fiber` | 프레임워크 | Gin / Echo / Fiber |
| `axum`, `actix-web` | 프레임워크 | Axum / Actix |
| `rails` | 프레임워크 | Rails |
| `laravel/framework` | 프레임워크 | Laravel |
| `postgresql`, `pg`, `psycopg`, `asyncpg`, `pgx`, `postgres` | DB | PostgreSQL |
| `mysql`, `mysql2`, `mariadb`, `pymysql` | DB | MySQL / MariaDB |
| `ojdbc`, `oracle` | DB | Oracle |
| `mssql-jdbc`, `mssql`, `tedious` | DB | SQL Server |
| `sqlite`, `sqlite3`, `better-sqlite3` | DB | SQLite |
| `h2database` | DB | H2 (테스트용인지 확인) |
| `mongodb`, `mongoose`, `pymongo`, `spring-boot-starter-data-mongodb` | DB | MongoDB |
| `redis`, `ioredis` | DB(보조) | Redis — 주 DB 와 따로 적는다 |
| `prisma`, `@prisma/client` | ORM | Prisma |
| `typeorm`, `sequelize`, `drizzle-orm`, `knex` | ORM | 해당 ORM |
| `spring-boot-starter-data-jpa`, `hibernate` | ORM | JPA / Hibernate |
| `mybatis` | ORM | MyBatis |
| `sqlalchemy`, `alembic` | ORM | SQLAlchemy (+ Alembic) |
| `flyway`, `liquibase` | 마이그레이션 | Flyway / Liquibase |
| `junit`, `spring-boot-starter-test` | 테스트 | JUnit |
| `jest`, `vitest`, `mocha`, `@playwright/test`, `cypress` | 테스트 | 해당 도구 |
| `pytest` | 테스트 | pytest |

`go`·`cargo` 는 테스트 도구가 내장(`go test`, `cargo test`)이다.

## 3. 스키마 파일 형식 결정

| 조건 | 계약 스키마 파일 | 템플릿 |
| --- | --- | --- |
| 관계형 DB (SQL 마이그레이션·ORM 무관) | `docs/schema.sql` — 해당 DB 의 DDL 문법 | `templates/schema.sql` |
| 문서형·키값 DB, 또는 스키마를 ORM 모델 코드로만 관리하는 스택 | `docs/schema.md` — 엔티티·필드 표 | `templates/schema.md` |
| DB 없음 | 스키마 파일을 만들지 않고 CLAUDE.md 에 "해당 없음" 기록 | — |

계약 스키마는 항상 `docs/` 에 둔다. 실제 마이그레이션 파일(Flyway, Alembic, ORM migration 등)은 구현 작업에서 implementer 가 계약을 보고 만든다.

## 4. 기본 빌드·테스트 명령 (감지 실패 시 후보)

`package.json` 의 `scripts` 처럼 프로젝트에 명령이 정의돼 있으면 그것을 우선한다.

| 빌드 도구 | 의존성 설치 | 빌드 | 테스트 |
| --- | --- | --- | --- |
| Gradle | — | `./gradlew build` | `./gradlew test` |
| Maven | — | `./mvnw package` | `./mvnw test` |
| npm | `npm install` | `npm run build` | `npm test` |
| pnpm | `pnpm install` | `pnpm build` | `pnpm test` |
| yarn | `yarn install` | `yarn build` | `yarn test` |
| pip / venv | `pip install -r requirements.txt` | — | `pytest` |
| Poetry | `poetry install` | `poetry build` | `poetry run pytest` |
| uv | `uv sync` | `uv build` | `uv run pytest` |
| go | `go mod download` | `go build ./...` | `go test ./...` |
| cargo | — | `cargo build` | `cargo test` |

## 5. 빈 프로젝트 선택지

감지 실패 시 질문 하나에 선택지를 최대 4개 보여준다(나머지는 "기타" 로 직접 입력). 아래 순서대로 위에서부터 고른다.

| 항목 | 선택지 후보 |
| --- | --- |
| 언어 | Java, TypeScript, Python, Go, Kotlin, Rust |
| 프레임워크 (언어별) | Java/Kotlin: Spring Boot, Quarkus · TypeScript: NestJS, Next.js, Express · Python: FastAPI, Django, Flask · Go: Gin, Echo, 표준 라이브러리 · Rust: Axum, Actix |
| DB | PostgreSQL, MySQL, SQLite, MongoDB, 없음 |
| 빌드 도구 (언어별) | Java/Kotlin: Gradle, Maven · TypeScript: npm, pnpm, yarn · Python: uv, Poetry, pip · Go: go · Rust: cargo |
| 테스트 도구 (언어별) | Java/Kotlin: JUnit · TypeScript: Vitest, Jest · Python: pytest · Go: go test · Rust: cargo test |

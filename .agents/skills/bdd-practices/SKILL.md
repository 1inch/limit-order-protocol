---
name: bdd-practices
description: Writes behavior specifications in Gherkin format. Use when defining features from user perspective or creating acceptance tests.
---

# BDD Practices

Gherkin 형식으로 기능을 명세하고, 선택적으로 자동화 테스트로 연결합니다.

**핵심 철학**:
- Feature First: .feature 명세 먼저, 구현 나중
- Specification by Example: 추상적 요구사항 대신 구체적 시나리오
- Living Documentation: .feature = 실행 가능한 문서 (자동화 없이도 가치 있음)

## .feature 파일의 가치

.feature 파일 자체가:
- **요구사항 명세서** - Given/When/Then으로 구조화
- **인수 조건 (Acceptance Criteria)** - 완료 기준 명확화
- **엣지 케이스 문서** - 예외 상황 정리
- **팀 커뮤니케이션 도구** - 비개발자도 읽을 수 있음

자동화 없이 명세로만 사용해도 충분한 가치가 있습니다.

## Phase 1: Discovery (발견)

새 기능이나 요구사항 논의 시:

1. **요구사항 파악**
   - 사용자가 요청한 기능을 명확히 이해
   - 모호한 부분은 사용자에게 질문

2. **Example Mapping**
   - 규칙(Rules)과 예시(Examples) 도출
   - 엣지 케이스 식별
   - 질문 목록 작성

3. **시나리오 목록 작성**
   - 핵심 시나리오 나열 (Happy Path)
   - 예외 시나리오 나열 (Edge Cases)
   - **우선순위 기준**:
     1. Happy Path (정상 플로우) - 가장 먼저
     2. 가장 흔한 예외 케이스
     3. 비즈니스 크리티컬 케이스
     4. 엣지 케이스 - 나중에
   - 예: "다음 시나리오들을 순서대로 진행하겠습니다: 1) 유효한 로그인, 2) 잘못된 비밀번호, 3) 존재하지 않는 사용자"

4. **사용자 확인**
   - 시나리오 목록 보여주기
   - 누락된 케이스 확인

5. **Phase 2로 진행**

---

## Phase 2: Formulation (명세화)

시나리오를 Gherkin 형식으로 작성:

1. **파일 위치 결정**
   - 프로젝트 내 `features/` 디렉토리 (권장)
   - 기존 .feature 파일이 있는지 확인
   - 사용자에게 확인

2. **.feature 파일 작성**
   ```gherkin
   Feature: 기능명
     기능에 대한 설명

     Scenario: 시나리오명
       Given 전제조건
       When 행동
       Then 결과
   ```

3. **Gherkin 작성 원칙**
   - 한 시나리오에 하나의 행동만
   - 구체적인 예시 데이터 사용
   - 구현 세부사항 노출 금지 (UI 요소, DB 쿼리 등)
   - 비즈니스 언어로 작성

4. **언어 선택**
   - 한글 키워드 사용 시 파일 첫 줄에 `# language: ko` 추가
   - 비개발자 협업, 한국어 도메인 → 한글 권장
   - 글로벌 팀, 오픈소스 → 영어 권장

5. **상세 문법**: `resources/01-gherkin-syntax.md` 참조 (한글 키워드 포함)

6. **사용자 확인**
   - 작성된 시나리오 보여주기
   - "이 시나리오가 요구사항을 정확히 반영하나요?"

7. **ldoc 연계** (선택)
   - .feature는 ldoc의 요구사항 문서로 활용 가능
   - `docs/requirements/` 또는 `features/` 디렉토리에 배치 권장

8. **Phase 3으로 진행**

---

## Phase 3: Automation (선택)

.feature를 자동화 테스트로 연결하려면:

1. **자동화 여부 확인**
   - 명세만 필요한 경우 → Phase 2에서 완료
   - 자동화 테스트가 필요한 경우 → 아래 진행

2. **상세 가이드**: `resources/02-automation.md` 참조
   - Step definitions 작성 (Python/JavaScript)
   - pytest-bdd, behave, cucumber-js 설정
   - RED → GREEN → REFACTOR 사이클

3. **tdd-practices 연계**
   - Step definition은 얇게 유지
   - 복잡한 내부 로직은 tdd-practices로 개발

---

## AI Red Flags 🚨

다음 징후 발견 시 즉시 중단하고 사용자에게 보고:

- 🚨 **.feature 없이 구현부터 시작**
  - BDD는 명세 먼저, 구현 나중
  - "먼저 시나리오를 작성하겠습니다"

- 🚨 **Step definition 없이 테스트 실행 시도**
  - Step definition이 없으면 테스트 실행 불가
  - Phase 3 건너뛰기 금지

- 🚨 **시나리오에 없는 기능 구현**
  - .feature에 정의된 행동만 구현
  - 추가 기능은 새 시나리오로

- 🚨 **구현 세부사항을 .feature에 노출**
  - "버튼을 클릭한다" ❌
  - "로그인을 시도한다" ✅

---

## tdd-practices 연계

**BDD vs TDD**:
- BDD: 시나리오 레벨 (.feature → Step definitions)
- TDD: 유닛 레벨 (테스트 → 함수/클래스)

**연계 시점**: 자동화 단계에서 복잡한 로직이 필요할 때
- Step definition은 얇게 유지
- 내부 로직은 tdd-practices의 RED-GREEN-REFACTOR로 개발

---

## Examples

### 기능 명세 작성 (자동화 없음)

```
User: "주문 취소 기능 명세해줘"
→ Phase 1: 시나리오 도출
  - 배송 전 취소 → 전액 환불
  - 배송 중 취소 → 불가
  - 배송 완료 후 → 반품 절차
→ Phase 2: features/order-cancel.feature 생성
→ 완료 (명세 문서로 활용)
```

### BDD 전체 플로우 (자동화 포함)

```
User: "로그인 기능 BDD로 구현해줘"
→ Phase 1-2: .feature 작성
→ Phase 3: resources/02-automation.md 참조
→ Step definitions + 구현
```

### 기존 .feature에 시나리오 추가

```
User: "비밀번호 찾기 시나리오 추가해줘"
→ Phase 1: 시나리오 도출
→ Phase 2: 기존 .feature에 추가
```

---

## Technical Details

- Gherkin 상세 문법: `resources/01-gherkin-syntax.md`
- 자동화 가이드: `resources/02-automation.md`
- 템플릿: `templates/crud.feature`, `templates/auth.feature`
- 유닛 테스트 연계: `tdd-practices`

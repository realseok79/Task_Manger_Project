package com.example.priority;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.within;

@DisplayName("DefaultDynamicPriorityStrategy 단위 테스트 - 정규화된 점수")
class DefaultDynamicPriorityStrategyTest {

    // 결정론적 검증을 위해 시계를 2026-06-06T12:00에 고정한다.
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 6, 12, 0);

    private DefaultDynamicPriorityStrategy strategy;

    @BeforeEach
    void setUp() {
        Clock fixed = Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());
        strategy = new DefaultDynamicPriorityStrategy(new UrgencyEvaluator(fixed));
    }

    private Task task(int starRating, LocalDateTime dueDate, int delayCount) {
        return new Task(1L, "T", "DEV", dueDate, starRating, delayCount);
    }

    @Test
    @DisplayName("정규화 정상 케이스 - 마감 60분·중요도 3·연기 2 (W=0.5/0.3/0.2)")
    void normalizedNormalCase() {
        // importance=3/5=0.6, urgency=120/(60+120)=0.6667, delay=2/5=0.4
        // score = 0.5*0.6 + 0.3*0.66667 - 0.2*0.4 = 0.3 + 0.2 - 0.08 = 0.42
        double score = strategy.calculate(task(3, NOW.plusMinutes(60), 2), new UserProfile(1L, 0.5, 0.3, 0.2));

        assertThat(score).isCloseTo(0.42, within(0.0001));
    }

    @Test
    @DisplayName("Overdue - 마감 경과 작업은 긴급도가 최대(1.0)로 반영된다")
    void overdueGetsMaxUrgency() {
        // urgency=120/(0+120)=1.0
        // score = 0.5*0.6 + 0.3*1.0 - 0.2*0.4 = 0.3 + 0.3 - 0.08 = 0.52
        double score = strategy.calculate(task(3, NOW.minusMinutes(30), 2), new UserProfile(1L, 0.5, 0.3, 0.2));

        assertThat(score).isCloseTo(0.52, within(0.0001));
    }

    @Test
    @DisplayName("지연 페널티가 커서 음수가 되면 하한선 0.0이 적용된다")
    void clampsToZero() {
        // importance=1/5=0.2, urgency=120/420=0.28571, delay=min(50/5,1)=1.0
        // score = 0.5*0.2 + 0.3*0.28571 - 0.2*1.0 = 0.1 + 0.08571 - 0.2 = -0.0143 → 0.0
        double score = strategy.calculate(task(1, NOW.plusMinutes(300), 50), new UserProfile(1L, 0.5, 0.3, 0.2));

        assertThat(score).isZero();
    }

    @Test
    @DisplayName("마감이 null이어도 NPE 없이 긴급도 0으로 안전하게 계산한다")
    void nullDeadlineIsSafe() {
        UserProfile profile = new UserProfile(1L, 0.5, 0.3, 0.2);
        Task noDeadline = task(4, null, 0);

        assertThatCode(() -> strategy.calculate(noDeadline, profile)).doesNotThrowAnyException();
        // urgency=0, delay=0 → score = 0.5*(4/5) = 0.4
        assertThat(strategy.calculate(noDeadline, profile)).isCloseTo(0.4, within(0.0001));
    }

    @Test
    @DisplayName("핵심 개선 - 긴급도가 중요도와 경쟁한다(임박한 저중요 작업이 먼 고중요 작업을 이길 수 있다)")
    void urgencyCompetesWithImportance() {
        // 긴급도 가중치가 높은 프로필(W=0.2/0.7/0.1)
        UserProfile urgencyDriven = new UserProfile(1L, 0.2, 0.7, 0.1);

        // 임박(10분 후)·중요도 낮음(2) vs 멀리(2000분 후)·중요도 높음(4)
        double imminentLowStar = strategy.calculate(task(2, NOW.plusMinutes(10), 0), urgencyDriven);
        double farHighStar = strategy.calculate(task(4, NOW.plusMinutes(2000), 0), urgencyDriven);

        // 기존 비정규화 공식에서는 긴급도가 무력해 항상 고중요(far)가 이겼다. 정규화 후엔 임박이 이긴다.
        assertThat(imminentLowStar).isGreaterThan(farHighStar);
    }

    @Test
    @DisplayName("무마감 작업은 연기(방치)가 쌓일수록 긴급도가 올라가 0으로 가라앉지 않는다")
    void noDeadlineAgingRaisesUrgency() {
        // 긴급도만 보는 프로필(W2=1)로 aging 효과를 격리
        UserProfile urgencyOnly = new UserProfile(1L, 0.0, 1.0, 0.0);

        double fresh = strategy.calculate(task(3, null, 0), urgencyOnly);     // 방치 0 → aging 0
        double neglected = strategy.calculate(task(3, null, 5), urgencyOnly); // 방치 5 → 5/(5+5)=0.5

        assertThat(fresh).isZero();
        assertThat(neglected).isGreaterThan(fresh);
        assertThat(neglected).isCloseTo(0.5, within(0.0001));
    }

    @Test
    @DisplayName("explain은 점수를 요소별 기여분(중요도/긴급도/지연)으로 분해한다")
    void explainBreaksDownScore() {
        // importance=0.5*0.6=0.3, urgency=0.3*(120/180)=0.2, delayPenalty=0.2*(2/5)=0.08, total=0.42
        ScoreBreakdown b = strategy.explain(task(3, NOW.plusMinutes(60), 2), new UserProfile(1L, 0.5, 0.3, 0.2));

        assertThat(b.importance()).isCloseTo(0.3, within(0.0001));
        assertThat(b.urgency()).isCloseTo(0.2, within(0.0001));
        assertThat(b.delayPenalty()).isCloseTo(0.08, within(0.0001));
        assertThat(b.total()).isCloseTo(0.42, within(0.0001));
    }
}

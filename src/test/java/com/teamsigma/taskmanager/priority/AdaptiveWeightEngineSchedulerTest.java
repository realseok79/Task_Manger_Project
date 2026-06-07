package com.teamsigma.taskmanager.priority;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.test.context.TestPropertySource;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * @Scheduled cron 외부화 검증.
 *
 * - 프로퍼티가 주어지면 그 값이 바인딩된다(@TestPropertySource 로 주입한 값 확인).
 * - 프로퍼티가 없을 때를 대비한 SpEL 기본값이 @Scheduled 에 내장되어 있다(애너테이션 리플렉션 확인).
 *   (테스트 yml 이 cron 을 항상 정의하므로 "프로퍼티 부재" 상황은 컨텍스트에서 재현 불가 →
 *    기본값 내장 여부를 애너테이션 메타데이터로 검증한다.)
 */
@SpringBootTest
@TestPropertySource(properties = "app.scheduler.weight-update-cron=0 */5 * * * ?")
@DisplayName("AdaptiveWeightEngine 스케줄러 설정 테스트")
class AdaptiveWeightEngineSchedulerTest {

    @Value("${app.scheduler.weight-update-cron}")
    private String boundCron;

    @Test
    @DisplayName("프로퍼티로 주입한 cron 값이 그대로 바인딩된다")
    void should_use_cron_from_property() {
        assertThat(boundCron).isEqualTo("0 */5 * * * ?");
    }

    @Test
    @DisplayName("@Scheduled 에 프로퍼티 부재 시 사용할 기본 cron(매일 자정)이 내장되어 있다")
    void should_embed_default_cron_in_scheduled_annotation() throws NoSuchMethodException {
        Method method = AdaptiveWeightEngine.class.getDeclaredMethod("learnAndAdjustWeights");
        Scheduled scheduled = method.getAnnotation(Scheduled.class);

        assertThat(scheduled).isNotNull();
        assertThat(scheduled.cron()).isEqualTo("${app.scheduler.weight-update-cron:0 0 0 * * ?}");
    }
}

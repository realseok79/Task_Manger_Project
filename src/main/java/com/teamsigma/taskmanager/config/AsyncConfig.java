package com.teamsigma.taskmanager.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import java.util.concurrent.Executor;

/**
 * 비동기 실행 설정.
 *
 * 왜 필요한가: @EnableAsync 가 없으면 @Async 어노테이션은 그냥 무시되어 메인 스레드에서 동기 실행된다.
 * 즉 "로그 적재가 메인 트랜잭션을 블로킹하지 않는다"는 설계 전제가 깨진다. 이를 보장하기 위해 명시적으로 켠다.
 */
@Configuration
@EnableAsync
public class AsyncConfig {

    /**
     * 로그 적재 전용 스레드풀.
     * 별도 풀로 격리하는 이유: 로그 적재가 폭주해도 다른 @Async 작업(향후 추가될)과 자원을 다투지 않게 하기 위함.
     */
    @Bean(name = "activityLogExecutor")
    public Executor activityLogExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);          // 로그 적재는 IO 한 번이라 부하가 낮아 소수 스레드로 충분
        executor.setMaxPoolSize(4);           // 일시적 버스트 대비 상한
        executor.setQueueCapacity(500);       // 큐로 버퍼링하여 순간 트래픽에 로그가 유실되지 않게 함
        executor.setThreadNamePrefix("activity-log-"); // 스레드 덤프에서 식별 쉽도록 prefix 부여
        executor.initialize();
        return executor;
    }
}

package com.teamsigma.taskmanager.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

/**
 * 엔진(UrgencyEvaluator 등)이 단일 시간원을 쓰도록 Clock 빈을 제공(결정론·테스트 가능).
 */
@Configuration
public class ClockConfig {

    @Bean
    public Clock clock() {
        return Clock.systemDefaultZone();
    }
}

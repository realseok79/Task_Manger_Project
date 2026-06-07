package com.teamsigma.taskmanager.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OpenAPI(Swagger) 문서 메타데이터 설정.
 * 프론트(최승환)/엔진(이진석) 파트가 /swagger-ui.html 에서 전체 API 계약을 한눈에 확인하도록 한다.
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI taskManagerOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Adaptive Task Manager API")
                        .description("지능형 할 일 관리 시스템 — 데이터 파이프라인 파트 API 명세")
                        .version("v0.0.1"));
    }
}

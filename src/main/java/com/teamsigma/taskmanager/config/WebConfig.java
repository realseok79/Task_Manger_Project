package com.teamsigma.taskmanager.config;

import org.springframework.lang.NonNull;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Arrays;
import java.util.List;
import java.util.Objects;

/**
 * CORS 설정.
 *
 * 허용 origin은 소스에 박지 않고 프로퍼티(app.cors.allowed-origins)로 주입한다.
 * 운영에서는 환경변수 APP_CORS_ALLOWED_ORIGINS 로 override 한다.
 *
 * 보안 주의: allowCredentials(true) 와 allowedOrigins("*") 조합은 Spring 이 런타임 예외를
 * 던지므로 절대 함께 쓰지 않는다. 여기서는 구체 origin 목록만 주입하므로 제약을 위반하지 않는다.
 * 추후 Spring Security 가 적용될 것을 고려해 CorsConfigurationSource 빈도 동일 설정으로 등록한다.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private static final List<String> ALLOWED_METHODS =
            List.of("GET", "POST", "PATCH", "DELETE", "OPTIONS");
    private static final long MAX_AGE_SECONDS = 3600L;

    @Value("${app.cors.allowed-origins:http://localhost:5173}")
    private String[] allowedOrigins;

    @Override
    public void addCorsMappings(@NonNull CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(Objects.requireNonNull(allowedOrigins))
                .allowedMethods(Objects.requireNonNull(ALLOWED_METHODS.toArray(String[]::new)))
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(MAX_AGE_SECONDS);
    }

    /** Spring Security 연동 대비: MVC CORS 와 동일한 정책을 가진 CorsConfigurationSource 빈. */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(Arrays.asList(allowedOrigins));
        config.setAllowedMethods(ALLOWED_METHODS);
        config.addAllowedHeader("*");
        config.setAllowCredentials(true);
        config.setMaxAge(MAX_AGE_SECONDS);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}

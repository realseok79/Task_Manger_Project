package com.teamsigma.taskmanager.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.data.domain.Page;

import java.util.List;
import java.util.function.Function;

/**
 * 표준 페이지네이션 응답 래퍼.
 *
 * Spring 의 PageImpl 을 그대로 직렬화하면 구조가 안정적이지 않다는 경고가 있어,
 * 프론트가 단일 파서로 다룰 수 있도록 content + 메타(page/size/totalElements/totalPages)만 명시적으로 노출한다.
 */
@Schema(description = "페이지네이션 응답")
public record PagedResponse<T>(
        @Schema(description = "현재 페이지 항목") List<T> content,
        @Schema(description = "현재 페이지 번호(0-base)", example = "0") int page,
        @Schema(description = "페이지 크기", example = "20") int size,
        @Schema(description = "전체 항목 수", example = "150") long totalElements,
        @Schema(description = "전체 페이지 수", example = "8") int totalPages
) {
    /** Page<E> 를 받아 각 요소를 mapper 로 변환한 PagedResponse<T> 로 만든다. */
    public static <E, T> PagedResponse<T> of(Page<E> page, Function<E, T> mapper) {
        List<T> content = page.getContent().stream().map(mapper).toList();
        return new PagedResponse<>(
                content,
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages()
        );
    }
}

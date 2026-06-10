package com.teamsigma.taskmanager.dto;

import com.teamsigma.taskmanager.domain.UserProfile;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 유저 우선순위 가중치 응답. w1/w2/w3 = 중요도/긴급도/지연패널티 가중치(합 1.0).
 */
@Schema(description = "유저 우선순위 가중치")
public record WeightResponse(
        @Schema(example = "1") Long userId,
        @Schema(description = "중요도 가중치", example = "0.5") double w1,
        @Schema(description = "긴급도 가중치", example = "0.3") double w2,
        @Schema(description = "지연패널티 가중치", example = "0.2") double w3
) {
    public static WeightResponse from(UserProfile profile) {
        return new WeightResponse(profile.getUserId(), profile.getW1(), profile.getW2(), profile.getW3());
    }
}

import "server-only";
import { anthropic } from "@ai-sdk/anthropic";

export const visionModel = anthropic("claude-opus-5-5");
export const agentModel = anthropic("claude-opus-5-5");

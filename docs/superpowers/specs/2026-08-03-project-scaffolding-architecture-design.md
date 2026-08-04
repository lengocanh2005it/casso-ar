# Project Scaffolding & Architecture Design

> Spec con của [docs/overview.md](../../../docs/overview.md). Định nghĩa cách khởi tạo repo, tổ chức monorepo, kiến trúc mã nguồn BE/FE và nguyên tắc code chung — nền tảng để mọi spec khác (domain-core, webhook-matching-engine, reminder-automation...) có chỗ "sống" cụ thể trong codebase. Dùng cấu trúc tooling chuẩn cho monorepo pnpm/Turborepo (turbo.json, pnpm-workspace.yaml, package.json root).

## 1. Monorepo structure (Turborepo + pnpm)

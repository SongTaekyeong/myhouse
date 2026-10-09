import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 운영 Docker 이미지를 가볍게 만들기 위함 (docker-compose.prod.yml 참고).
  output: "standalone",
};

export default nextConfig;

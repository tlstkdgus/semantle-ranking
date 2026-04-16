import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 허용된 개발 호스트 (원격 브라우저에서 HMR 등 dev 리소스 접근 허용)
  // 허용 값에 포트/프로토콜과 호스트명만 둘 다 포함하여 처리
  allowedDevOrigins: [
    "http://70.12.60.85:3000", "70.12.60.85",
    "http://70.12.60.86:3000", "70.12.60.86",
    "http://localhost:3000", "localhost",
  ],
  async headers() {
    return [
      {
        // 모든 API 경로에 대해 CORS를 허용
        source: "/api/:path*",  // 모든 API 경로에 대해 설정
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*",  // 모든 origin에서 접근 가능하게 설정
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, DELETE, OPTIONS",  // 허용할 HTTP 메서드 설정
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type",  // 허용할 요청 헤더
          },
        ],
      },
    ];
  },
};

export default nextConfig;
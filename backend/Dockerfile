# 운영용 이미지. 내부 도커 네트워크에서만 열려있고 인터넷에 직접 노출되지 않는다
# (프론트 Route Handler를 통해서만 호출됨 - SPEC.md §8, docker-compose.prod.yml 참고).
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

# Etapa de construcción
FROM node:20-alpine AS build

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de configuración
COPY package*.json ./
COPY vite.config.js* ./
COPY postcss.config.js* ./
COPY tailwind.config.js* ./
COPY .eslintrc* ./
COPY tsconfig.json* ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY src/ ./src/
COPY public/ ./public/
COPY index.html ./

# Construir la aplicación
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# Etapa de producción
FROM nginx:stable-alpine

# Copiar configuración personalizada de nginx si es necesaria
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar archivos de construcción desde la etapa anterior
COPY --from=build /app/dist /usr/share/nginx/html

# Configurar nginx para manejar rutas SPA (Single Page Application)
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Exponer puerto
EXPOSE 80

# Comando para iniciar nginx
CMD ["nginx", "-g", "daemon off;"]
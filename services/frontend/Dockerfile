FROM nginx:alpine
COPY *.html *.css *.svg *.js /usr/share/nginx/html/
COPY demo/ /usr/share/nginx/html/demo/
COPY v2/ /usr/share/nginx/html/v2/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

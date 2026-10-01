# Локальная разработка: PHP 7.4 + Apache, как на проде (db/plllasma.sql снят с PHP 7.4).
# Репозиторий монтируется в /var/www/html целиком (docker-compose.yml), образ лишь
# досыпает настройки PHP и готовит папку аттачментов — исходников внутри нет.
FROM php:7.4-apache

# mysqli не входит в официальный образ — сайт целиком на нём (api/include/main.php)
RUN docker-php-ext-install mysqli

RUN a2enmod rewrite

# Apache по умолчанию не доносит заголовок Authorization до PHP, а api/user-by-token.php
# умеет токен и из Authorization: Bearer — пробрасываем (стандартный костыль для mod_php)
RUN printf 'SetEnvIf Authorization ^(.*) HTTP_AUTHORIZATION=$1\n' \
      > /etc/apache2/conf-available/zz-pass-authorization.conf \
    && a2enconf zz-pass-authorization

COPY docker/php-dev.ini /usr/local/etc/php/conf.d/zz-plllasma-dev.ini

# PATH_TO_STORAGE в api/include/main.php — "../../attachments/" от api/, то есть
# /var/www/attachments: на страницу выше корня сайта, как на проде. Том занимает её
# при первом старте и наследует владельца, поэтому chown — здесь.
RUN mkdir -p /var/www/attachments && chown www-data:www-data /var/www/attachments

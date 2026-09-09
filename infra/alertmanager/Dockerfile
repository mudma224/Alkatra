# Image Alertmanager avec rendu de template à l'entrée.
# L'image officielle prom/alertmanager (base busybox) n'a pas de shell apt/apk :
# le rendu utilise sed (busybox natif), sans binaire externe.
FROM prom/alertmanager:v0.27.0

USER root
COPY entrypoint.sh /entrypoint.sh
COPY alertmanager.yml.template /etc/alertmanager/alertmanager.yml.template
RUN chmod +x /entrypoint.sh

USER nobody
ENTRYPOINT ["/entrypoint.sh"]
# Le binaire est explicite dans CMD : busybox `exec` traiterait un premier
# argument commençant par « -- » comme une option du shell.
CMD ["alertmanager", "--config.file=/etc/alertmanager/alertmanager.yml", "--storage.path=/alertmanager"]

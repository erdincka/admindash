---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ appName }}
  namespace: ezapp-user
  labels:
    app.kubernetes.io/instance: {{ appName }}
    app.kubernetes.io/managed-by: EzAppConfig
    app.kubernetes.io/name: {{ appName }}
    app.kubernetes.io/version: v0.0.1
    hpe-ezua/app: {{ appName }}
    hpe-ezua/type: vendor-service
  annotations: {% if isSSO %} [hpe-ezua/add-auth-token: 'true'] {% else %} {{ '{}' }} {% endif %}
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/instance: {{ appName }}
      app.kubernetes.io/name: {{ appName }}
  template:
    metadata:
      labels:
        app.kubernetes.io/instance: {{ appName }}
        app.kubernetes.io/managed-by: EzAppConfig
        app.kubernetes.io/name: {{ appName }}
        app.kubernetes.io/version: v0.0.1
        hpe-ezua/app: {{ appName }}
        hpe-ezua/type: vendor-service
      annotations: {% if isSSO %} [hpe-ezua/add-auth-token: 'true'] {% else %} {{ '{}' }} {% endif %}
    spec:
      containers:
        - name: {{ appName }}
          image: {{ appImage }}
          command:
            - /bin/bash
            - '-c'
            - /app.sh
          workingDir: /
          ports:
            - name: http
              containerPort: {{ appPort }}
              protocol: TCP
          env:
            - name: OIDC_CLIENT_SECRET
              value: "${OIDC_CLIENT_SECRET}"
            - name: OIDC_CLIENT_ID
              value: "${OIDC_CLIENT_ID}"
            - name: domain
              value: "${OIDC_DOMAIN}"
          resources:
            limits:
              cpu: '2'
              memory: 4Gi
            requests:
              cpu: '1'
              memory: 2Gi
          volumeMounts:
            - name: {{ appName }}-volume
              mountPath: /
          imagePullPolicy: IfNotPresent
          securityContext:
            runAsUser: 0
            runAsNonRoot: false
      restartPolicy: Always
      serviceAccountName: {{ appName }}-sa
      serviceAccount: {{ appName }}-sa
      securityContext: {}
      schedulerName: default-scheduler
      volumes:
        - name: {{ appName }}-volume
          configMap:
            name: app-runsh
            items:
              - key: app
                path: app.sh
            defaultMode: 511

{{/*
HPE EZUA labels
*/}}
{{- define "hpe-ezua.labels" -}}
hpe-ezua/app: {{ .Release.Name }}
hpe-ezua/type: vendor-service
add-external-df-volume: "true"
add-user-info-config: "true"
{{- end }}

{{- define "hpe-ezua.annotations" -}}
hpe-ezua/add-auth-token: "true"
{{- end }}
# AegisDesk shell

Cascarón Windows independiente de SIDC. Se instala después de AegisSetup y
guarda su configuración mutable en `C:\ProgramData\AegisDesk`.

## Construcción local

```powershell
pwsh .\build.ps1 -Version 0.1.0 -WorkerBaseURL https://worker.example -StateIssuer https://worker.example
```

Para verificar estados firmados, el release debe recibir el DER de la clave
pública Ed25519 en Base64 mediante `-PublicKeyBase64` y el `kid` con
`-StateKeyID`. La clave privada nunca entra al shell. El workflow de release
rechaza builds sin verificador configurado.

El instalador de Inno Setup es opcional (`-Installer`). El primer arranque pide
un código de enrolamiento de un solo uso y la ruta local del ejecutable operativo
de SIDC; luego crea el acceso directo visible `SIDC`.

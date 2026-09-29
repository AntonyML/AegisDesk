export const ticketPageScript = `(() => {
  const form = document.querySelector("#ticket-form");
  const toast = document.querySelector("#ticket-toast");
  const button = form.querySelector("button");
  const categorySelect = document.querySelector("#field-category");
  const issueSelect = document.querySelector("#field-issue_code");
  const catalog = JSON.parse(form.dataset.catalog || "[]");
  let toastTimer;

  const updateIssueOptions = () => {
    const category = catalog.find((entry) => entry.value === categorySelect.value);
    issueSelect.replaceChildren(new Option("Seleccioná un problema", ""));
    for (const issue of category?.issues || []) {
      issueSelect.add(new Option(issue.label, issue.value));
    }
    issueSelect.disabled = !category;
    if (!category) issueSelect.value = "";
  };

  categorySelect.addEventListener("change", updateIssueOptions);

  const showToast = (message, kind) => {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = kind;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 5000);
  };

  const clearErrors = () => {
    document.querySelectorAll(".field-error").forEach((el) => {
      el.textContent = "";
    });
    document.querySelectorAll("[aria-invalid]").forEach((el) => {
      el.removeAttribute("aria-invalid");
    });
  };

  const getErrorMessage = (code, field) => {
    if (code === "TOO_LONG") {
      return "El texto ingresado supera el límite de longitud permitido.";
    }
    if (code === "INVALID") {
      if (field === "name" || field === "team") {
        return "Por favor ingresá un valor válido (sin caracteres de control).";
      }
      if (field === "category") {
        return "Seleccioná un área válida.";
      }
      if (field === "issue_code") {
        return "Seleccioná un problema válido para el área elegida.";
      }
      return "El valor ingresado no es válido.";
    }
    return "Revisá los datos ingresados.";
  };

  const resetTurnstile = () => {
    if (window.turnstile && window.aegisTurnstileWidgetId !== null) {
      window.turnstile.reset(window.aegisTurnstileWidgetId);
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();
    button.disabled = true;

    const formData = new FormData(form);
    const turnstile =
      document.querySelector('[name="cf-turnstile-response"]')?.value ||
      "local-development";

    const idempotencyKey = crypto.randomUUID();
    const payload = {
      name: formData.get("name") || "",
      team: formData.get("team") || "",
      category: formData.get("category") || "",
      issue_code: formData.get("issue_code") || "",
      turnstile_token: turnstile,
      idempotency_key: idempotencyKey,
    };

    const sendRequest = async () => {
      return fetch("/api/v1/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    };

    let response;
    try {
      try {
        response = await sendRequest();
      } catch (networkErr) {
        // Retry ONLY on network error, reusing the exact same idempotency_key
        response = await sendRequest();
      }
    } catch {
      showToast("Error de conexión al enviar el ticket. Intenta nuevamente.", "error");
      button.disabled = false;
      resetTurnstile();
      return;
    }

    try {
      if (response.status === 422) {
        // DO NOT retry on 422. Parse specific validation error
        const errData = await response.json();
        const field = errData.field;
        const code = errData.code;
        const msg = getErrorMessage(code, field);

        const errorSpan = document.getElementById("error-" + field);
        const fieldInput = document.getElementById("field-" + field);
        if (fieldInput) {
          fieldInput.setAttribute("aria-invalid", "true");
          fieldInput.focus();
        }
        if (errorSpan) {
          errorSpan.textContent = msg;
        }
        showToast("Por favor corrige los campos señalados.", "error");
        return;
      }

      if (!response.ok) {
        showToast("No se pudo enviar el ticket. Intenta nuevamente más tarde.", "error");
        return;
      }

      form.reset();
      updateIssueOptions();
      showToast(
        "Ticket enviado correctamente. El equipo de soporte revisará tu solicitud.",
        "success",
      );
    } finally {
      resetTurnstile();
      button.disabled = false;
    }
  });
})();`;

const CONFIG = {
  apiBase: "https://api.test.ndla.no"
};

let progress = { total: 0, completed: 0, failed: [] };

function updateProgress() {
  const percent = progress.total ? (progress.completed / progress.total) * 100 : 0;
  document.getElementById("progressBar").value = percent;
  document.getElementById("progressText").innerText =
    `${progress.completed} / ${progress.total}`;
}

function extractTags(name) {
  return name.replace(/\.[^/.]+$/, "").split(/[-_ ]+/);
}

async function upload(file) {
  const metadata = {
    title: file.name.replace(/\.[^/.]+$/, ""),
    tags: extractTags(file.name)
  };

  const fd = new FormData();
  fd.append("file", file);
  fd.append("metadata", JSON.stringify(metadata));

  const res = await fetch(CONFIG.apiBase + "/image-api/v3/images", {
    method: "POST",
    body: fd
  });

  if (!res.ok) throw new Error("Feil");
}

async function startUpload() {
  const files = Array.from(document.getElementById("files").files);
  progress.total = files.length;
  progress.completed = 0;
  progress.failed = [];
  updateProgress();

  for (const f of files) {
    try {
      await upload(f);
    } catch (e) {
      progress.failed.push(f.name);
    }
    progress.completed++;
    updateProgress();
  }

  document.getElementById("errors").innerText =
    progress.failed.length ? "Feil: " + progress.failed.join(", ") : "Ferdig";
}

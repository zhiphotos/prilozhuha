diff --git a//dev/null b/public/script.js
index 0000000000000000000000000000000000000000..66ce0d187a489ce90ca74fc9109208fb9510feb2 100644
--- a//dev/null
+++ b/public/script.js
@@ -0,0 +1,59 @@
+const lessons = [
+    { title: 'Урок 1: Введение', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' },
+    { title: 'Урок 2: Архитектуры', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' },
+    { title: 'Урок 3: Обучение', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' },
+    { title: 'Урок 4: Практика', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' },
+    { title: 'Урок 5: Оптимизация', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' },
+    { title: 'Урок 6: Применение', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' }
+];
+
+function loadProgress() {
+    const saved = localStorage.getItem('progress');
+    return saved ? JSON.parse(saved) : {};
+}
+
+function saveProgress(progress) {
+    localStorage.setItem('progress', JSON.stringify(progress));
+}
+
+function updateProgressDisplay(progress) {
+    const completed = Object.values(progress).filter(Boolean).length;
+    document.getElementById('progress').textContent = `Прогресс: ${completed}/6`;
+}
+
+function createLessonButtons(progress) {
+    const list = document.getElementById('lesson-list');
+    lessons.forEach((lesson, index) => {
+        const btn = document.createElement('button');
+        btn.textContent = lesson.title;
+        if (progress[index]) {
+            btn.classList.add('completed');
+        }
+        btn.addEventListener('click', () => {
+            loadLesson(index);
+        });
+        list.appendChild(btn);
+    });
+}
+
+function loadLesson(index) {
+    const lesson = lessons[index];
+    const content = document.getElementById('lesson-content');
+    content.innerHTML = `
+        <h2>${lesson.title}</h2>
+        <iframe src="${lesson.url}" allowfullscreen></iframe>
+        <div>
+            <button id="complete-btn">Отметить как пройдено</button>
+        </div>
+    `;
+    document.getElementById('complete-btn').addEventListener('click', () => {
+        progress[index] = true;
+        saveProgress(progress);
+        document.querySelectorAll('#lesson-list button')[index].classList.add('completed');
+        updateProgressDisplay(progress);
+    });
+}
+
+const progress = loadProgress();
+createLessonButtons(progress);
+updateProgressDisplay(progress);

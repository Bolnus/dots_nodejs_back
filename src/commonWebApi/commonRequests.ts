import type { Request as ExpressRequest, Response as ExpressResponse } from "express";

/** Health check handler that returns a simple HTML status page. */
export function getStatus(req: ExpressRequest, res: ExpressResponse): void {
  console.log(`${req.method} | ${req.path}`);
  res.send(
    `<body style="margin: 0;">
      <div
      id="rootDiv"
      style="background: #36383F;
      display: flex;
      align-items: center;
      justify-content:
      center; width: 100%;
      height: 100%;
      font-size: 3em;
      color: white;"
      >Backend online</div>
      <script>setInterval(() => {
        const rootDiv = document.querySelector("#rootDiv");
        let text = "Backend online";
        switch(rootDiv.textContent) {
          case text:
            rootDiv.textContent = text + ".";
            break;
          case text + ".":
            rootDiv.textContent = text + "..";
            break;
          case text + "..":
            rootDiv.textContent = text + "...";
            break;
          case text + "...":
            location.reload();
            break;
        }
      }, 2000)</script>
      </body>`
  );
}

import { useState } from "react";
import { Button, Modal } from "./ui";
import { CreditDocument } from "./CreditDocument";
export function CreditArchive({
  applicationId,
  name,
  kind,
}: {
  applicationId: string;
  name: string;
  kind: string;
}) {
  const [document, setDocument] = useState<"contract" | "schedule" | null>(
    null,
  );
  const root = `/api/mvp2/applications/${applicationId}/documents/`;
  const title =
    document === "contract"
      ? "Подписанный договор PDF"
      : "График / условия лимита PDF";
  return (
    <div className="mvp-cabinet-documents">
      <h3>{name}</h3>
      <p>
        Финансирование ·{" "}
        {kind === "loan"
          ? "выдача оформлена"
          : "лимит открыт; до выборки долг равен нулю"}
      </p>
      <h4>Документы</h4>
      <p>
        <a
          href={root + "contract"}
          onClick={(e) => {
            if (!e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              setDocument("contract");
            }
          }}
        >
          Подписанный договор PDF
        </a>{" "}
        ·{" "}
        <a
          href={root + "schedule"}
          onClick={(e) => {
            if (!e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              setDocument("schedule");
            }
          }}
        >
          График / условия лимита PDF
        </a>
      </p>
      {document && (
        <div className="credit-archive">
          <Modal title={title} wide onClose={() => setDocument(null)}>
            <div className="mvp-document-tools">
              <Button secondary onClick={() => setDocument("contract")}>
                Договор
              </Button>
              <Button secondary onClick={() => setDocument("schedule")}>
                График / условия лимита
              </Button>
              <a href={root + document + "?download=1"}>Скачать PDF</a>
            </div>
            <CreditDocument url={root + document + "?signed=1"} title={title} />
          </Modal>
        </div>
      )}
    </div>
  );
}

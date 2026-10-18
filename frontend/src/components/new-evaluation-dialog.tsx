import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, Play } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { APP_CONFIGS, EVALUATORS } from "@/mock-data";
import { evaluationService, queries } from "@/services";
import { isMock } from "@/services/api-client";
import { usePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { KeyValue } from "./page-parts";

const STEPS = ["Dataset", "Application", "Evaluators", "Review"];

export function NewEvaluationDialog({ trigger }: { trigger?: ReactNode }) {
  const { prefs } = usePreferences();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [datasetId, setDatasetId] = useState(prefs.defaultDatasetId);
  const [version, setVersion] = useState("");
  const [configId, setConfigId] = useState(APP_CONFIGS[0].id);
  const [evaluators, setEvaluators] = useState<string[]>(prefs.defaultEvaluators);
  const [submitting, setSubmitting] = useState(false);
  const { data: datasets = [] } = useQuery({ ...queries.datasets(), enabled: open });
  const qc = useQueryClient();
  const navigate = useNavigate();

  const ds = datasets.find((d) => d.id === datasetId);
  const ver = version || ds?.currentVersion || "";
  const cfg = APP_CONFIGS.find((c) => c.id === configId)!;
  const caseCount = ds?.versions.find((v) => v.version === ver)?.caseIds.length ?? 0;
  const canNext = step === 0 ? !!ds && caseCount > 0 : step === 2 ? evaluators.length > 0 : true;

  const reset = () => {
    setStep(0);
    setVersion("");
    setDatasetId(prefs.defaultDatasetId);
    setEvaluators(prefs.defaultEvaluators);
  };

  async function start() {
    setSubmitting(true);
    try {
      const run = await evaluationService.create({ datasetId, datasetVersion: ver, configId, evaluators });
      await qc.invalidateQueries({ queryKey: ["runs"] });
      toast.success(`Evaluation ${run.id} started`);
      setOpen(false);
      reset();
      navigate({ to: "/evaluations/$runId", params: { runId: run.id } });
    } catch (e) {
      toast.error("Could not start evaluation", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Play /> Run Evaluation
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New evaluation</DialogTitle>
          <DialogDescription>{isMock() ? "The run completes in about 5 seconds." : "Configure and start an evaluation run."}</DialogDescription>
        </DialogHeader>

        <ol className="flex items-center gap-2 text-xs" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className={cn("flex size-5 items-center justify-center rounded-full border text-[10px]", i < step && "border-primary bg-primary text-primary-foreground", i === step && "border-primary text-primary")}>
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              <span className={cn(i === step ? "font-medium" : "text-muted-foreground", "hidden sm:inline")}>{s}</span>
              {i < STEPS.length - 1 && <span className="h-px w-4 bg-border" />}
            </li>
          ))}
        </ol>

        <div className="min-h-56 py-2">
          {step === 0 && (
            <div className="space-y-4">
              <RadioGroup value={datasetId} onValueChange={(v) => { setDatasetId(v); setVersion(""); }} className="space-y-1.5">
                {datasets.map((d) => (
                  <Label key={d.id} htmlFor={d.id} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent">
                    <RadioGroupItem id={d.id} value={d.id} className="mt-0.5" />
                    <span>
                      <span className="block font-mono text-sm font-medium">{d.name}</span>
                      <span className="block text-xs text-muted-foreground">{d.description}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              {ds && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Version</span>
                  {ds.versions.map((v) => (
                    <Button key={v.version} size="sm" variant={ver === v.version ? "default" : "outline"} onClick={() => setVersion(v.version)}>
                      {v.version} · {v.caseIds.length} cases
                    </Button>
                  ))}
                </div>
              )}
              {ds && caseCount === 0 && <p className="text-sm text-destructive">This version has no test cases.</p>}
            </div>
          )}
          {step === 1 && (
            <RadioGroup value={configId} onValueChange={setConfigId} className="space-y-1.5">
              {APP_CONFIGS.map((c) => (
                <Label key={c.id} htmlFor={c.id} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent">
                  <RadioGroupItem id={c.id} value={c.id} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">{c.label}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{c.appVersion} · {c.provider}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          )}
          {step === 2 && (
            <div className="space-y-1.5">
              {EVALUATORS.map((e) => (
                <Label key={e.id} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal">
                  <Checkbox checked={evaluators.includes(e.id)} onCheckedChange={(c) => setEvaluators(c ? [...evaluators, e.id] : evaluators.filter((x) => x !== e.id))} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">{e.label}</span>
                    <span className="block text-xs text-muted-foreground">{e.description}</span>
                  </span>
                </Label>
              ))}
              {!evaluators.length && <p className="text-sm text-destructive">Select at least one evaluator.</p>}
            </div>
          )}
          {step === 3 && (
            <div className="rounded-md border p-4">
              <KeyValue
                items={[
                  ["Dataset", <span className="font-mono">{ds?.name} {ver}</span>],
                  ["Test cases", caseCount],
                  ["Application", cfg.label],
                  ["App version", <span className="font-mono">{cfg.appVersion}</span>],
                  ["Evaluators", EVALUATORS.filter((e) => evaluators.includes(e.id)).map((e) => e.label).join(", ")],
                ]}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => (step ? setStep(step - 1) : setOpen(false))}>{step ? "Back" : "Cancel"}</Button>
          {step < 3 ? (
            <Button disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</Button>
          ) : (
            <Button disabled={submitting} onClick={start}>
              <Play /> {submitting ? "Starting…" : "Start evaluation"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client'

import { useState, useEffect } from "react";
import BalancesWidget from "@/components/dashboard/BalancesWidget";
import QuickActions from "@/components/dashboard/QuickActions";
import RecentTransactions from "@/components/dashboard/RecentTransactions";
import GoalForm from "@/components/savings/GoalForm";
import { ContributionWidget } from "@/components/savings/ContributionWidget";
import useWallet from "@/hooks/useWallet";
import { useOffline } from "@/components/offline/OfflineProvider";
import { useToast } from "@/components/ui/use-toast";
import type { Goal, Contribution, GoalSchedule, RoundUpRule } from "@/lib/types/savings";
import {
  fetchGoals,
  contributeToGoal,
  getMockGoalsFallback,
  getContributionHistoryOnChain,
  setRoundUpRuleOnChain,
  pauseScheduleOnChain,
  resumeScheduleOnChain,
  cancelScheduleOnChain,
} from "@/lib/stellar/savingsGoalContract";

export default function DashboardPage() {
  const { freighter } = useWallet();
  const publicKey = freighter.publicKey;
  const { isOnline, queueAction } = useOffline();
  const { toast } = useToast();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const availableBalance = 500;

  useEffect(() => {
    async function loadGoals() {
      if (publicKey) {
        try {
          const contractGoals = await fetchGoals(publicKey);
          setGoals(contractGoals);
        } catch (e) {
          console.error(e);
          setGoals(getMockGoalsFallback());
        }
      } else {
        setGoals(getMockGoalsFallback());
      }
    }
    loadGoals();
  }, [publicKey]);

  // Load contributions for goals
  useEffect(() => {
    async function loadAllContributions() {
      if (publicKey && goals.length > 0) {
        try {
          const allContribs: Contribution[] = [];
          for (const goal of goals) {
            try {
              const history = await getContributionHistoryOnChain(goal.id, publicKey);
              allContribs.push(...history);
            } catch (err) {
              console.error(`Failed to fetch history for goal ${goal.id}:`, err);
            }
          }
          setContributions(allContribs);
        } catch (e) {
          console.error("Failed to load contribution history:", e);
        }
      }
    }
    loadAllContributions();
  }, [goals, publicKey]);

  const handleGoalCreated = (newGoal: Goal) => {
    setGoals(prev => [...prev, newGoal]);
  };

  const handleContribute = async (goalId: string, amount: number) => {
    if (!isOnline) {
      queueAction('CONTRIBUTE_GOAL', `Contribute to goal: ${goalId}`, { goalId, amount });
      toast({
        title: "Contribution Queued",
        description: "Offline: Your contribution has been queued and will be processed when you reconnect.",
      });
      // Optimistic UI update
      setGoals(prev => prev.map(goal =>
        goal.id === goalId
          ? { ...goal, currentAmount: goal.currentAmount + amount }
          : goal
      ));
      return;
    }

    if (publicKey) {
      try {
        await contributeToGoal(publicKey, goalId, amount);
        const contractGoals = await fetchGoals(publicKey);
        setGoals(contractGoals);
        toast({
          title: "Contribution Successful",
          description: `Successfully contributed ${amount} XLM to your goal.`,
        });
      } catch (e: unknown) {
        const errMessage = e instanceof Error ? e.message : String(e);
        toast({
          title: "Contribution Failed",
          description: errMessage,
          variant: "destructive",
        });
      }
    } else {
      // Fallback
      setGoals(prev => prev.map(goal =>
        goal.id === goalId
          ? { ...goal, currentAmount: goal.currentAmount + amount }
          : goal
      ));
    }
  };

  const handleUpdateSchedule = async (goalId: string, schedule: GoalSchedule | undefined) => {
    if (publicKey) {
      try {
        if (!schedule) {
          await cancelScheduleOnChain(goalId, publicKey);
        } else if (schedule.paused) {
          await pauseScheduleOnChain(goalId, publicKey);
        } else {
          await resumeScheduleOnChain(goalId, publicKey);
        }
        const contractGoals = await fetchGoals(publicKey);
        setGoals(contractGoals);
      } catch (e) {
        console.error("Failed to update schedule:", e);
      }
    }
  };

  const handleUpdateRoundUpRule = async (goalId: string, rule: RoundUpRule) => {
    if (publicKey) {
      try {
        await setRoundUpRuleOnChain(goalId, rule.enabled, rule.nearestUnit, publicKey);
        const contractGoals = await fetchGoals(publicKey);
        setGoals(contractGoals);
      } catch (e) {
        console.error("Failed to update round-up rule:", e);
      }
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Page heading */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full border border-[#e8b84b]/20 bg-[#e8b84b]/[0.08] text-[#e8b84b]">
          <div className="w-1.5 h-1.5 rounded-full bg-[#e8b84b] animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
            Live Overview
          </span>
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
          Good day, <span className="text-[#e8b84b]">Stellar</span> user
        </h1>
        <p className="text-[#7a8aaa] mt-1 text-sm max-w-md">
          Here&apos;s a snapshot of your portfolio and recent blockchain activity.
        </p>
      </div>

      {/* Balances */}
      <BalancesWidget />

      {/* Quick Actions */}
      <QuickActions />

      {/* Savings Goals */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">Savings Goals</h2>
          <button
            onClick={() => setGoalModalOpen(true)}
            className="px-4 py-2 bg-[#e8b84b] text-black rounded-lg hover:bg-[#e8b84b]/90 transition-colors"
          >
            Create Goal
          </button>
        </div>
        {goals.length === 0 ? (
          <div className="text-center py-8 text-[#7a8aaa]">
            No savings goals yet. Create your first goal to start saving!
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {goals.map((goal) => (
              <ContributionWidget
                key={goal.id}
                goal={goal}
                contributions={contributions}
                onContribute={handleContribute}
                availableBalance={availableBalance}
                onUpdateSchedule={handleUpdateSchedule}
                onUpdateRoundUpRule={handleUpdateRoundUpRule}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <RecentTransactions />

      <GoalForm
        open={goalModalOpen}
        onOpenChange={setGoalModalOpen}
        onGoalCreated={handleGoalCreated}
      />
    </div>
  );
}

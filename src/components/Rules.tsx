import { useSkin } from "./Skin.tsx";
import {
  Trophy,
  Store,
  Hand,
  ArrowDownToLine,
  ArrowLeftRight,
  Coins,
  Award,
  Flag,
  Eye,
  BookOpen,
  GraduationCap,
} from "lucide-react";

export function Rules({ onTutorial }: { onTutorial?: () => void }) {
  const { t } = useSkin();
  return (
    <div className="rules">
      <p className="eyebrow">{t("THE ART OF THE DEAL")}</p>
      <h2>{t("成为大君的御用商人")}</h2>
      <p>
        {t("你与米拉轮流在集市拿货、交换和出售。收市时，赚到更多卢比的商人获得一枚卓越印章。")}
      </p>
      {onTutorial && (
        <button className="secondary" onClick={onTutorial}>
          <GraduationCap size={18} aria-hidden="true" />
          新手教程 · 动手练习
        </button>
      )}
      <p className="rule-goal">
        <Trophy aria-hidden="true" />
        <span>
          <b>1 局定胜负：</b>赢下一轮即获胜。
          <br />
          <b>三局两胜：</b>{t("率先获得 2 枚印章者获胜。")}
        </span>
      </p>

      <section>
        <h3>
          <Store aria-hidden="true" />
          {t("准备开市")}
        </h3>
        <p>
          {t("每人发 5 张牌。手中的骆驼移入各自驼队，其他货物留在手里。市场放置 5 张公开的牌，其中开局至少有 3 张骆驼。")}
        </p>
        <p>
          {t("首轮随机先手，之后由上一轮落败者先手。货物手牌最多")} <b>7 张</b>
          {t("，驼队不占手牌数量。")}
        </p>
        <p className="rule-note">
          {t("共 55 张牌：钻石、黄金、白银各 6 张，丝绸、香料各 8 张，皮革 10 张，骆驼 11 张。")}
        </p>
      </section>

      <section>
        <h3>
          <Hand aria-hidden="true" />
          每回合，选择一种行动
        </h3>
        <div className="rule-grid">
          <article>
            <h4>
              <Hand aria-hidden="true" />
              {t("拿取货物")}
            </h4>
            <p>
              {t("从市场拿取")} <b>{t("1 张货物")}</b>{t("加入手牌，再从牌堆补充市场。")}
            </p>
            <p className="rule-operation">
              {t("操作：点选一张市场货物，再点击“确认拿取”。")}
            </p>
          </article>
          <article>
            <h4>
              <ArrowDownToLine aria-hidden="true" />
              {t("收下骆驼")}
            </h4>
            <p>
              {t("拿走市场上")}<b>{t("全部骆驼")}</b>{t("，加入自己的驼队，再补充市场。")}
            </p>
            <p className="rule-operation">
              {t("操作：点市场上任意一张骆驼即可全选，再点击“收下全部骆驼”。")}
            </p>
          </article>
          <article>
            <h4>
              <ArrowLeftRight aria-hidden="true" />
              {t("等量交换")}
            </h4>
            <p>
              拿取至少 <b>{t("2 张市场货物")}</b>
              {t("，付出相同数量的手牌、骆驼，或两者混合。")}
            </p>
            <p>
              {t("不能换入骆驼，同类货物不能同时拿取和付出。交换后手牌仍不超过 7 张。")}
            </p>
            <p className="rule-operation">
              {t("操作：选好市场货物，再选付出的手牌。用交易栏加减按钮调整付出的骆驼，核对数量后点击“确认交换”。")}
            </p>
          </article>
          <article>
            <h4>
              <Coins aria-hidden="true" />
              {t("出售货物")}
            </h4>
            <p>
              {t("出售")}<b>{t("一种货物")}</b>{t("，按张数领取对应货物筹码，价值高的先取。")}
            </p>
            <p>
              <b>{t("钻石、黄金、白银至少 2 张起售。")}</b>{t("丝绸、香料和皮革可以只卖 1 张。")}
            </p>
            <p className="rule-operation">
              {t("操作：点选手中的同类货物，核对收益预览，再点击“确认出售”。")}
            </p>
          </article>
        </div>
        <p className="rule-note rule-action-note">
          再次点选卡牌可取消，也可点击“重选”清空选择；确认交易前都能调整。
        </p>
        <p className="rule-note">
          交易确认后自动保存。未结束的比赛可从主页继续，已结束的比赛可回看。
        </p>
      </section>

      <section>
        <h3>
          <Award aria-hidden="true" />
          {t("一次多卖，额外奖励")}
        </h3>
        <p>{t("一次出售同类货物达到以下数量，额外领取一枚随机奖励筹码：")}</p>
        <div className="rule-bonuses">
          <div>
            <b>3 张</b>
            <span>{t("1–3 卢比")}</span>
          </div>
          <div>
            <b>4 张</b>
            <span>{t("4–6 卢比")}</span>
          </div>
          <div>
            <b>5 张及以上</b>
            <span>{t("8–10 卢比")}</span>
          </div>
        </div>
        <p className="rule-note">
          {t("对应奖励堆耗尽后不再领取奖励。货物筹码不足时，领取剩余筹码；奖励仍按实际出售张数计算。")}
        </p>
      </section>

      <section>
        <h3>
          <Flag aria-hidden="true" />
          {t("收市与胜负")}
        </h3>
        <p>{t("满足任一条件，本轮立即收市：")}</p>
        <ul>
          <li>
            <b>{t("三类货物筹码售罄。")}</b>
          </li>
          <li>
            <b>牌堆无法将市场补满 5 张。</b>
          </li>
        </ul>
        <p>
          {t("货物筹码与奖励筹码相加，就是本轮收入。")}<b>{t("骆驼更多的一方再加 5 卢比")}</b>
          {t("；骆驼一样多时，双方都不加分。手中剩余货物不计分。")}
        </p>
        <p>
          {t("总分高者赢得本轮。同分时，先比较奖励筹码枚数，再比较货物筹码枚数；仍完全相同时，轮换先手加赛。")}
        </p>
      </section>

      <section>
        <h3>
          <Eye aria-hidden="true" />
          哪些信息可以看
        </h3>
        <ul>
          <li>{t("你可以查看自己的手牌、驼队、收入和得分明细。")}</li>
          <li>
            {t("对手已发生的交易、手牌张数和筹码枚数公开；手牌内容、驼队数量、累计得分及奖励面值在收市前保密。")}
          </li>
          <li>{t("回放会公开双方当时的手牌、驼队和得分，方便复盘。")}</li>
        </ul>
      </section>

      <p className="muted rule-credits">
        {t("基于 Sébastien Pauchon 设计的 Jaipur 规则制作的非官方练习实现。视觉为原创 SVG，未使用原作卡牌素材。")}
        <a
          href="https://cdn.svc.asmodee.net/production-spacecowboys/uploads/2025/11/Rules-JAIPUR-12x17-Version-EN_BD.pdf"
          target="_blank"
          rel="noreferrer"
        >
          <BookOpen size={15} aria-hidden="true" />
          查看原版规则书 ↗
        </a>
      </p>
    </div>
  );
}
